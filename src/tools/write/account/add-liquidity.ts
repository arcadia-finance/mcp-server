import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { ArcadiaApiError, type ArcadiaApiClient } from "../../../clients/api.js";
import { CHAIN_ID_DESCRIPTION, type ChainId, type ChainConfig } from "../../../config/chains.js";
import { getPublicClient } from "../../../clients/chain.js";
import { readAccountMetadata } from "./metadata.js";
import { formatBatchedResponse, isSimulationFailed } from "./format-response.js";
import { TOKENS } from "../../../config/addresses.js";
import { validateAddress, validateChainId } from "../../../utils/validation.js";
import type { PriceCheck } from "../../../types/api.js";
import { BatchedTransactionOutput } from "../../output-schemas.js";

interface StrategyUnderlying {
  underlying_address: string;
  underlying_decimals: number;
}

interface RiskFactor {
  minimum_margin: number;
}

interface StrategyDetail {
  strategy_id: number;
  asset_address: string;
  asset_decimals: number;
  underlyings: StrategyUnderlying[];
  details?: {
    risk_factors?: Record<string, RiskFactor>;
  };
}

interface AccountAsset {
  address: string;
  id: number;
  amount: string;
}

function formatUsd(value: number): string {
  const digits =
    Math.abs(value) >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 4 };
  return `${value.toLocaleString("en-US", digits)} USD`;
}

function refusalMessage(err: unknown): string | undefined {
  if (!(err instanceof ArcadiaApiError) || err.status !== 400) return undefined;
  const body = err.body;
  if (body === null || typeof body !== "object") return undefined;
  const message = (body as Record<string, unknown>).message;
  return typeof message === "string" ? message : undefined;
}

function describePriceCheck(check: PriceCheck, tokenSymbols: Map<string, string>): string {
  const name = (addr: string) => tokenSymbols.get(addr.toLowerCase()) ?? addr;
  if (check.status === "off_market") {
    if (typeof check.deviation_bps !== "number") {
      throw new Error(
        `Malformed price check for pool ${check.pool}: off_market without deviation_bps.`,
      );
    }
    const pct = Math.abs(check.deviation_bps) / 100;
    return `Pool ${check.pool} (${name(check.token0)}/${name(check.token1)}): pool price is ${pct}% off market.`;
  }
  if (!check.unpriced_token_name) {
    throw new Error(
      `Malformed price check for pool ${check.pool}: unpriced without unpriced_token_name.`,
    );
  }
  const parts = [
    `Pool ${check.pool} (${name(check.token0)}/${name(check.token1)}): no price information for ${check.unpriced_token_name}, so the pool price cannot be verified.`,
  ];
  if (check.implied_usd_price != null) {
    parts.push(`The pool implies a price of ${formatUsd(check.implied_usd_price)}.`);
  }
  if (check.swap_spend_usd != null) {
    parts.push(`The position swaps about ${formatUsd(check.swap_spend_usd)} at that price.`);
  }
  return parts.join(" ");
}

function formatTokenAmount(value: bigint, decimals: number, maxFrac = 8): string {
  const str = value.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, -decimals);
  const frac = str.slice(-decimals).slice(0, maxFrac).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function registerAddLiquidityTool(
  server: McpServer,
  api: ArcadiaApiClient,
  chains: Record<ChainId, ChainConfig>,
) {
  server.registerTool(
    "write_account_add_liquidity",
    {
      annotations: {
        title: "Build Add Liquidity Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: BatchedTransactionOutput,
      description:
        "Multi-step flash-action: atomically combines [deposit from wallet] + [use account collateral] + [swap to optimal ratio] + [mint LP] + [borrow if leveraged] in ONE transaction. Do NOT call write_account_deposit separately. Capital sources: wallet tokens (deposits array), existing account collateral (use_account_assets=true), or both. Check allowances first (read_wallet_allowances), then approve if needed (write_wallet_approve). Supports depositing multiple tokens and minting multiple LP positions in one tx. Works with both margin accounts (can leverage) and spot accounts (no leverage). For workflows, call read_guides('strategies'). The returned calldata is time-sensitive: sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Response includes tenderly_sim_url and tenderly_sim_status for pre-broadcast validation. expected_value_change is in raw units of the account's numeraire token (6 decimals for USDC, 18 for WETH). Negative = cost to open, positive = value gained. Compare before.total_account_value and after.total_account_value for the full picture. If a pool's price is off market or one of its tokens has no price, the tool returns the price warnings and NO transaction. Show the warnings to the user and call again with accept_price_risk=true only after the user explicitly confirms they accept them. The acknowledgement never bypasses a backend refusal.",
      inputSchema: z.object({
        account_address: z.string().describe("Arcadia account address"),
        wallet_address: z.string().describe("Wallet address of the account owner"),
        positions: z
          .array(
            z.object({
              strategy_id: z
                .number()
                .describe("From read_strategy_list (or read_strategy_info for full range detail)"),
              tick_lower: z
                .number()
                .optional()
                .describe("Lower tick for concentrated range. Omit for full range."),
              tick_upper: z
                .number()
                .optional()
                .describe("Upper tick for concentrated range. Omit for full range."),
            }),
          )
          .describe("LP positions to mint. For a single position, pass one entry."),
        deposits: z
          .array(
            z.object({
              asset: z.string().describe("Token address to deposit from wallet"),
              amount: z.string().describe("Amount in raw units"),
              decimals: z
                .number()
                .optional()
                .describe("Token decimals (e.g. 6 for USDC, 18 for WETH). Default 18."),
            }),
          )
          .optional()
          .describe(
            "Wallet tokens to deposit. Approve each token first (write_wallet_approve). Omit to use only account collateral.",
          ),
        use_account_assets: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "If true, use ALL existing account collateral for LP minting. Fetched automatically.",
          ),
        leverage: z
          .number()
          .optional()
          .default(0)
          .describe("0 = no borrow, 2 = 2x leverage. Margin accounts only."),
        slippage: z.number().optional().default(100).describe("Basis points, 100 = 1%"),
        accept_price_risk: z
          .boolean()
          .optional()
          .describe(
            "Set true only after the user has explicitly confirmed the price warnings returned by a previous call. Never set it on the first call.",
          ),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      }),
    },
    async ({
      account_address,
      wallet_address,
      positions,
      deposits: walletDeposits,
      use_account_assets,
      leverage,
      slippage,
      accept_price_risk,
      chain_id,
    }) => {
      try {
        const validChainId = validateChainId(chain_id);
        const validAccount = validateAddress(account_address, "account_address");
        validateAddress(wallet_address, "wallet_address");

        // Reverse lookup: address → symbol for human-readable error messages
        const tokenSymbols = new Map<string, string>();
        const chainTokens = TOKENS[validChainId];
        if (chainTokens) {
          for (const [symbol, info] of Object.entries(chainTokens)) {
            tokenSymbols.set(info.address.toLowerCase(), symbol);
          }
        }

        const hasDeposits = walletDeposits && walletDeposits.length > 0;

        // Validate: at least one capital source
        if (!hasDeposits && !use_account_assets) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Provide deposits (wallet tokens) and/or use_account_assets=true (account collateral). At least one capital source is required.",
              },
            ],
            isError: true,
          };
        }

        // Auto-detect account version + numeraire
        const { accounts } = await api.getAccounts(chain_id, wallet_address);
        const accountStub = (
          accounts as Array<{
            account_address: string;
            creation_version: number;
            numeraire: string;
          }>
        ).find((a) => a.account_address.toLowerCase() === account_address.toLowerCase());
        if (!accountStub) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Account ${account_address} not found for wallet ${wallet_address} on chain ${chain_id}.`,
              },
            ],
            isError: true,
          };
        }
        const version = accountStub.creation_version;

        // Auto-detect creditor from account overview (fall back to on-chain reads)
        const overview = (await api
          .getAccountOverview(chain_id, account_address)
          .catch(() => null)) as Record<string, unknown> | null;
        let creditor: string;
        if (overview) {
          creditor = (overview.creditor as string) ?? "";
        } else {
          const client = getPublicClient(validChainId, chains);
          const metadata = await readAccountMetadata(client, validAccount);
          creditor = metadata.creditor;
        }

        // Spot vs margin detection
        const isSpot = !creditor || creditor === "0x0000000000000000000000000000000000000000";

        // Guard: spot accounts cannot leverage
        if (isSpot && (leverage ?? 0) > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Spot accounts cannot borrow. Set leverage to 0, or create a margin account (V3) with a creditor (lending pool) using write_account_create.",
              },
            ],
            isError: true,
          };
        }

        // Guard: V4 accounts cannot leverage even with a creditor
        if (version >= 4 && (leverage ?? 0) > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: V4 accounts are spot-only and cannot borrow or use leverage. Create a V3 margin account (account_version: 3) with a creditor to use leverage.",
              },
            ],
            isError: true,
          };
        }

        // Fetch assets list (used for numeraire decimals + sell array decimals)
        const rawAssets = await api.getAssets(chain_id);
        const assetObj = rawAssets as Record<string, unknown>;
        const assetList = (
          Array.isArray(rawAssets) ? rawAssets : (assetObj.assets ?? assetObj.data ?? [])
        ) as Record<string, unknown>[];
        const decimalsMap = new Map<string, number>();
        for (const a of assetList) {
          const addr = ((a.address ?? a.asset_address ?? "") as string).toLowerCase();
          if (addr && a.decimals != null) decimalsMap.set(addr, Number(a.decimals));
        }

        // Resolve numeraire + decimals
        const numeraire = accountStub.numeraire;
        const numeraire_decimals = decimalsMap.get(numeraire?.toLowerCase() ?? "") ?? 18;

        // Strategy lookup for all positions
        const allStrategies = (await api.getStrategies(chain_id)) as unknown as StrategyDetail[];
        const resolvedPositions: Array<{
          strategy: StrategyDetail;
          tick_lower?: number;
          tick_upper?: number;
        }> = [];
        for (const pos of positions) {
          const strategy = allStrategies.find((s) => s.strategy_id === pos.strategy_id);
          if (!strategy) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Strategy ${pos.strategy_id} not found on chain ${chain_id}.`,
                },
              ],
              isError: true,
            };
          }
          resolvedPositions.push({
            strategy,
            tick_lower: pos.tick_lower,
            tick_upper: pos.tick_upper,
          });
        }

        // Minimum margin guard per deposit against first strategy's risk factors
        if (hasDeposits) {
          const firstStrategy = resolvedPositions[0].strategy;
          const riskFactors = firstStrategy.details?.risk_factors;
          if (riskFactors) {
            for (const dep of walletDeposits!) {
              const riskEntry = Object.entries(riskFactors).find(
                ([addr]) => addr.toLowerCase() === dep.asset.toLowerCase(),
              );
              if (riskEntry) {
                const minMargin = BigInt(riskEntry[1].minimum_margin);
                const depositBig = BigInt(dep.amount);
                if (depositBig < minMargin) {
                  const decimals = dep.decimals ?? 18;
                  const depFormatted = formatTokenAmount(depositBig, decimals);
                  const minFormatted = formatTokenAmount(minMargin, decimals);
                  return {
                    content: [
                      {
                        type: "text" as const,
                        text: `Error: Deposit ${depFormatted} ${tokenSymbols.get(dep.asset.toLowerCase()) ?? dep.asset} is below the minimum ${minFormatted} ${tokenSymbols.get(dep.asset.toLowerCase()) ?? dep.asset} on strategy ${firstStrategy.strategy_id}. Increase the deposit amount.`,
                      },
                    ],
                    isError: true,
                  };
                }
              }
            }
          }
        }

        // Build sell array from account assets
        let sell: Array<{
          asset_address: string;
          amount: string;
          decimals: number;
          asset_id: number;
        }> = [];
        if (use_account_assets) {
          if (!overview && !hasDeposits) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: use_account_assets=true but account overview is unavailable and no wallet deposits were provided. Provide deposits or deposit assets first via write_account_deposit.",
                },
              ],
              isError: true,
            };
          }
          const accountAssets = overview ? ((overview.assets ?? []) as AccountAsset[]) : [];
          if (accountAssets.length === 0 && !hasDeposits) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: use_account_assets=true but the account has no deposited assets, and no wallet deposits were provided. Deposit assets first via write_account_deposit or provide deposits.",
                },
              ],
              isError: true,
            };
          }
          if (accountAssets.length > 0) {
            sell = accountAssets.map((a) => ({
              asset_address: a.address,
              amount: String(a.amount),
              decimals: decimalsMap.get(a.address.toLowerCase()) ?? 18,
              asset_id: Number(a.id ?? 0),
            }));
          }
        }

        // Build deposits from wallet
        const deposits = hasDeposits
          ? {
              addresses: walletDeposits!.map((d) => d.asset),
              ids: walletDeposits!.map(() => 0),
              amounts: walletDeposits!.map((d) => d.amount),
              decimals: walletDeposits!.map((d) => d.decimals ?? 18),
            }
          : {
              addresses: [] as string[],
              ids: [] as number[],
              amounts: [] as string[],
              decimals: [] as number[],
            };

        // Build buy array from positions
        const distribution = 1 / resolvedPositions.length;
        const buy = resolvedPositions.map(({ strategy, tick_lower, tick_upper }) => {
          const entry: {
            asset_address: string;
            distribution: number;
            decimals: number;
            strategy_id: number;
            ticks?: { tick_lower: number; tick_upper: number };
          } = {
            asset_address: strategy.asset_address,
            distribution,
            decimals: strategy.asset_decimals,
            strategy_id: strategy.strategy_id,
          };
          if (tick_lower !== undefined && tick_upper !== undefined) {
            entry.ticks = { tick_lower, tick_upper };
          }
          return entry;
        });

        const body = {
          buy,
          sell,
          deposits,
          withdraws: {
            addresses: [] as string[],
            ids: [] as number[],
            amounts: [] as string[],
            decimals: [] as number[],
          },
          wallet_address,
          account_address,
          numeraire,
          numeraire_decimals,
          debt: {
            take: isSpot ? false : (leverage ?? 0) > 0,
            leverage: isSpot ? 1 : (leverage ?? 0),
            repay: 0,
            creditor,
          },
          chain_id,
          version,
          action_type: "portfolio.advanced",
          slippage: slippage ?? 100,
          price_checks_supported: true,
        };
        const result = await api.getBundleCalldata(body);
        const res = result as unknown as Record<string, unknown>;

        const priceChecks = (res.price_checks ?? []) as PriceCheck[];
        const flagged = priceChecks.filter((c) => c.status !== "ok");
        const warnings = flagged.map((c) => describePriceCheck(c, tokenSymbols));
        const warningText = warnings.length > 0 ? `\nPrice warnings:\n${warnings.join("\n")}` : "";

        // Surface simulation failure — do NOT return calldata
        if (isSimulationFailed(res.tenderly_sim_status)) {
          const simUrl = res.tenderly_sim_url
            ? `\nTenderly simulation: ${res.tenderly_sim_url}`
            : "";
          const simError = res.tenderly_sim_error
            ? `\nRevert reason: ${res.tenderly_sim_error}`
            : "";
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Transaction simulation FAILED. Do NOT broadcast.${simError}\nCommon causes: insufficient wallet balance, missing token approval, or deposit below minimum margin.${simUrl}${warningText}`,
              },
            ],
            isError: true,
          };
        }

        if (flagged.length > 0 && !accept_price_risk) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Price warnings, no transaction returned. Show these warnings to the user. Call again with accept_price_risk=true only after the user explicitly confirms they accept them.${warningText}`,
              },
            ],
            isError: true,
          };
        }

        const response = formatBatchedResponse(res, chain_id, "Add liquidity to LP position");
        if (priceChecks.length > 0) response.price_checks = priceChecks;
        if (
          priceChecks.some((c) => c.status === "unpriced") &&
          res.expected_change_status === false &&
          res.expected_value_change == null
        ) {
          response.expected_value_change_unavailable =
            "No price information for a token, so the value change cannot be computed.";
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
          structuredContent: response,
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${refusalMessage(err) ?? (err instanceof Error ? err.message : String(err))}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
