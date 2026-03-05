import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { getPublicClient } from "../../clients/chain.js";
import { readAccountMetadata } from "./account-metadata.js";
import { formatAdvancedResponse } from "./format-response.js";

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

export function registerAddLiquidityTool(
  server: McpServer,
  api: ArcadiaApiClient,
  chains: Record<ChainId, ChainConfig>,
) {
  server.tool(
    "build_add_liquidity_tx",
    "Multi-step flash-action: atomically combines [deposit from wallet] + [use account collateral] + [swap to optimal ratio] + [mint LP] + [borrow if leveraged] in ONE transaction. Do NOT call build_deposit_tx separately. Capital sources: wallet tokens (deposit_asset/amount), existing account collateral (use_account_assets=true), or both. Approve wallet token first (build_approve_tx) if depositing from wallet. Works with both margin accounts (can leverage) and spot accounts (no leverage). For workflows, call get_guide('strategies'). The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Response includes tenderly_sim_url and tenderly_sim_status for pre-broadcast validation.",
    {
      account_address: z.string().describe("Arcadia account address"),
      wallet_address: z.string().describe("Wallet address of the account owner"),
      strategy_id: z.number().describe("From get_strategies tool"),
      deposit_asset: z
        .string()
        .optional()
        .describe("Token address to deposit from wallet. Omit to use only account collateral."),
      deposit_amount: z.string().optional().describe("Amount in raw units to deposit from wallet"),
      deposit_decimals: z
        .number()
        .optional()
        .describe("Token decimals for wallet deposit (e.g. 6 for USDC, 18 for WETH). Default 18."),
      use_account_assets: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, use ALL existing account collateral for LP minting. Fetched automatically.",
        ),
      tick_lower: z
        .number()
        .optional()
        .describe("Lower tick for concentrated range. Omit for full range."),
      tick_upper: z
        .number()
        .optional()
        .describe("Upper tick for concentrated range. Omit for full range."),
      leverage: z
        .number()
        .optional()
        .default(0)
        .describe("0 = no borrow, 2 = 2x leverage. Margin accounts only."),
      slippage: z.number().optional().default(100).describe("Basis points, 100 = 1%"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({
      account_address,
      wallet_address,
      strategy_id,
      deposit_asset,
      deposit_amount,
      deposit_decimals,
      use_account_assets,
      tick_lower,
      tick_upper,
      leverage,
      slippage,
      chain_id,
    }) => {
      try {
        // Validate: at least one capital source
        if (!deposit_asset && !use_account_assets) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Provide deposit_asset (wallet tokens) and/or use_account_assets=true (account collateral). At least one capital source is required.",
              },
            ],
            isError: true,
          };
        }
        if (deposit_asset && !deposit_amount) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: deposit_amount is required when deposit_asset is provided.",
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
          const client = getPublicClient(chain_id as ChainId, chains);
          const metadata = await readAccountMetadata(client, account_address as `0x${string}`);
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
                text: "Error: Spot accounts cannot borrow. Set leverage to 0, or create a margin account (V3) with a creditor (lending pool) using build_create_account_tx.",
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

        // Strategy lookup
        const strategies = (await api.getStrategies(chain_id)) as unknown as StrategyDetail[];
        const strategy = strategies.find((s) => s.strategy_id === strategy_id);
        if (!strategy) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Strategy ${strategy_id} not found on chain ${chain_id}.`,
              },
            ],
            isError: true,
          };
        }

        // Minimum margin guard — only for wallet deposits
        if (deposit_asset && deposit_amount) {
          const depositLower = deposit_asset.toLowerCase();
          const riskFactors = strategy.details?.risk_factors;
          if (riskFactors) {
            const riskEntry = Object.entries(riskFactors).find(
              ([addr]) => addr.toLowerCase() === depositLower,
            );
            if (riskEntry) {
              const minMargin = BigInt(riskEntry[1].minimum_margin);
              const depositBig = BigInt(deposit_amount);
              if (depositBig < minMargin) {
                const decimals = deposit_decimals ?? 18;
                const depFormatted = (Number(depositBig) / 10 ** decimals).toFixed(
                  Math.min(decimals, 8),
                );
                const minFormatted = (Number(minMargin) / 10 ** decimals).toFixed(
                  Math.min(decimals, 8),
                );
                return {
                  content: [
                    {
                      type: "text" as const,
                      text: `Error: Deposit ${depFormatted} is below the minimum ${minFormatted} for ${deposit_asset} on strategy ${strategy_id} (raw: ${deposit_amount} < ${minMargin.toString()}). Increase the deposit amount.`,
                    },
                  ],
                  isError: true,
                };
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
          if (!overview) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: use_account_assets=true but account overview is unavailable (cannot read asset list). Use deposit_asset/deposit_amount to deposit from wallet instead.",
                },
              ],
              isError: true,
            };
          }
          const accountAssets = (overview.assets ?? []) as AccountAsset[];
          if (accountAssets.length === 0 && !deposit_asset) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: use_account_assets=true but the account has no deposited assets, and no wallet deposit was provided. Deposit assets first via build_deposit_tx or provide deposit_asset/deposit_amount.",
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
        const deposits = deposit_asset
          ? {
              addresses: [deposit_asset],
              ids: [0],
              amounts: [deposit_amount!],
              decimals: [deposit_decimals ?? 18],
            }
          : {
              addresses: [] as string[],
              ids: [] as number[],
              amounts: [] as string[],
              decimals: [] as number[],
            };

        // Build buy entry with optional ticks
        const buyEntry: {
          asset_address: string;
          distribution: number;
          decimals: number;
          strategy_id: number;
          ticks?: { tick_lower: number; tick_upper: number };
        } = {
          asset_address: strategy.asset_address,
          distribution: 1,
          decimals: strategy.asset_decimals,
          strategy_id,
        };
        if (tick_lower !== undefined && tick_upper !== undefined) {
          buyEntry.ticks = { tick_lower, tick_upper };
        }

        const body = {
          buy: [buyEntry],
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
            leverage: isSpot ? 1 : (leverage ?? 0), // backend requires leverage=1 for spot (matches dapp)
            repay: 0,
            creditor,
          },
          chain_id,
          version,
          action_type: "portfolio.advanced",
          slippage: slippage ?? 100,
        };
        const result = await api.getBundleCalldata(body);

        // Surface simulation failure — do NOT return calldata
        if (result.tenderly_sim_status === "false") {
          const simUrl = result.tenderly_sim_url
            ? `\nTenderly simulation: ${result.tenderly_sim_url}`
            : "";
          const simError = result.tenderly_sim_error
            ? `\nRevert reason: ${result.tenderly_sim_error}`
            : "";
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Transaction simulation FAILED — do NOT broadcast.${simError}\nCommon causes: insufficient wallet balance, missing token approval, or deposit below minimum margin.${simUrl}`,
              },
            ],
            isError: true,
          };
        }

        const res = result as unknown as Record<string, unknown>;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(formatAdvancedResponse(res, chain_id), null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
