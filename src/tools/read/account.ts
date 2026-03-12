import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { accountAbi } from "../../abis/index.js";
import { getPublicClient } from "../../clients/chain.js";
import {
  getChainAmChecks,
  AM_KEY_TO_POOL_PROTOCOL,
  CHAIN_POSITION_MANAGERS,
  UNIVERSAL_POSITION_MANAGERS,
  type AmProtocol,
} from "../../config/addresses.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";
import { AccountInfoOutput, AccountHistoryOutput, AccountPnlOutput } from "../output-schemas.js";

function trimOverview(
  overview: Record<string, unknown>,
  chainId: ChainId,
): Record<string, unknown> {
  const trimmed = { ...overview };

  if (Array.isArray(trimmed.historic_actions)) {
    trimmed.historic_actions_count = (trimmed.historic_actions as unknown[]).length;
    delete trimmed.historic_actions;
  }

  if (Array.isArray(trimmed.assets)) {
    trimmed.assets = (trimmed.assets as Record<string, unknown>[]).map((a) => {
      const { related_strategies, asset_details, ...rest } = a;
      const asset: Record<string, unknown> = { ...rest };
      if (Array.isArray(related_strategies) && related_strategies.length > 0) {
        asset.strategy_count = related_strategies.length;
      }
      const details = asset_details as Record<string, unknown> | undefined;
      if (details) {
        if (details.reward_token) asset.reward_token = details.reward_token;
        if (details.token0) asset.token0 = details.token0;
        if (details.token1) asset.token1 = details.token1;
      }
      if (typeof rest.address === "string") {
        const addr = rest.address.toLowerCase();
        const dexProtocol =
          CHAIN_POSITION_MANAGERS[chainId]?.[addr] ?? UNIVERSAL_POSITION_MANAGERS[addr];
        if (dexProtocol) asset.dex_protocol = dexProtocol;
      }
      return asset;
    });
  }

  delete trimmed.total_value_spot;
  delete trimmed.total_value_spot_usd;
  delete trimmed.net_numeraire_spot;
  delete trimmed.debt_numeraire_spot;
  delete trimmed.debt_usd_spot;

  if (trimmed.health_factor === 1) {
    delete trimmed.maintenance_margin;
    delete trimmed.maintenance_margin_usd;
    delete trimmed.collateral_value_account;
    delete trimmed.collateral_value_account_usd;
    delete trimmed.liquidation_value_account;
    delete trimmed.liquidation_value_account_usd;
    delete trimmed.used_margin;
    delete trimmed.used_margin_usd;
  }

  return trimmed;
}

export function registerAccountTools(
  server: McpServer,
  api: ArcadiaApiClient,
  chains: Record<ChainId, ChainConfig>,
) {
  server.registerTool(
    "read.account.info",
    {
      annotations: {
        title: "Get Account Info",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get full overview of an Arcadia account: health factor, collateral value, debt, deposited assets, liquidation price, and automation status. Health factor = 1 - (used_margin / liquidation_value): 1 = no debt (safest), >0 = healthy, 0 = liquidation threshold, <0 = past liquidation. Higher is safer. On Base, also returns which asset managers are enabled (rebalancer, compounder, yield_claimer, merkl_operator, cow_swapper). LP positions in assets[] include a dex_protocol field (slipstream, slipstream_v2, staked_slipstream, staked_slipstream_v2, uniV3, uniV4) — use this as the dex_protocol param for write.asset_manager.* tools. The automation object uses internal AM key names (slipstreamV1, slipstreamV2, uniV3, uniV4): map slipstreamV1 → 'slipstream'/'staked_slipstream', slipstreamV2 → 'slipstream_v2'/'staked_slipstream_v2', uniV3 → 'uniV3', uniV4 → 'uniV4'. Numeric fields without a _usd suffix are in the account's numeraire token raw units (divide by 10^decimals: 6 for USDC, 18 for WETH, 8 for cbBTC). Fields ending in _usd are in USD with 18 decimals (divide by 1e18). health_factor is unitless. Asset amounts are raw token units. To list all accounts for a wallet, use read.wallet.accounts.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: AccountInfoOutput,
    },
    async ({ account_address, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        const validAccount = validateAddress(account_address, "account_address");
        const client = getPublicClient(validChainId, chains);
        const [overview, liquidation_price, accountVersion] = await Promise.all([
          api.getAccountOverview(validChainId, account_address).catch(() => null),
          api.getLiquidationPrice(validChainId, account_address).catch(() => null),
          client
            .readContract({
              address: validAccount,
              abi: accountAbi,
              functionName: "ACCOUNT_VERSION",
            })
            .then((v: bigint) => Number(v))
            .catch(() => null),
        ]);

        if (!overview && !liquidation_price && !accountVersion) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Could not fetch any data for this account. The account may not exist or the API may be temporarily unavailable.",
              },
            ],
            isError: true,
          };
        }

        const notes: string[] = [];

        if (!overview) {
          notes.push("Account overview unavailable. Partial data returned.");
        }

        if (overview) {
          const ov = overview as Record<string, unknown>;
          const hf = Number(ov.health_factor ?? 0);
          const totalDebt = Number(ov.total_open_debt ?? 0);
          if (hf >= 1 && totalDebt === 0) {
            notes.push(
              "health_factor is 1 with zero debt — this is the safest state. The account has no outstanding loans.",
            );
          }
        }

        if (liquidation_price) {
          const liq = liquidation_price as Record<string, unknown>;
          const liqPrice = Number(liq.liquidation_price ?? 0);
          if (liqPrice > 1_000_000) {
            notes.push(
              `liquidation_price is extremely high ($${liqPrice.toLocaleString()}) — this is typical for delta-neutral positions where both sides of the LP move together. Liquidation is very unlikely.`,
            );
          }
        }

        let automation: Record<string, unknown> | null = null;
        const owner = (overview as Record<string, unknown> | null)?.owner as string | undefined;
        if (owner) {
          const amChecks = getChainAmChecks(validChainId);
          automation = await client
            .multicall({
              contracts: amChecks.map((c) => ({
                address: validAccount,
                abi: accountAbi,
                functionName: "isAssetManager",
                args: [owner as `0x${string}`, c.address as `0x${string}`],
              })),
              allowFailure: true,
            })
            .then((results: { status: string; result?: boolean }[]) => {
              const out: Record<string, string | boolean> = {};
              for (const c of amChecks) out[c.group] = false;
              let activeProtocol: string | null = null;
              results.forEach((r: { status: string; result?: boolean }, i: number) => {
                if (r.status !== "success" || !r.result) return;
                const check = amChecks[i];
                if (check.protocol) {
                  const userFacing = AM_KEY_TO_POOL_PROTOCOL[check.protocol as AmProtocol];
                  out[check.group] = userFacing ?? check.protocol;
                  if (!activeProtocol) activeProtocol = userFacing ?? check.protocol;
                } else {
                  out[check.group] = true;
                }
              });
              if (activeProtocol) {
                out.dex_protocol = activeProtocol;
              }
              return out;
            })
            .catch(() => null);
        }

        const result: Record<string, unknown> = {
          account_version: accountVersion,
          overview: overview
            ? trimOverview(overview as Record<string, unknown>, validChainId)
            : null,
          liquidation_price,
        };
        if (automation) result.automation = automation;
        if (notes.length > 0) result.context_notes = notes;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
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

  server.registerTool(
    "read.account.history",
    {
      annotations: {
        title: "Get Account History",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get historical collateral and debt values for an Arcadia account over time. Returns a time series of snapshots (timestamp, collateral_value, debt_value, net_value). Each value is the account's net value in USD (human-readable, not raw units). Useful for charting account performance over a period.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        days: z.number().default(14).describe("Number of days of history (default 14)"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: AccountHistoryOutput,
    },
    async ({ account_address, days, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        if (days <= 0) {
          return {
            content: [{ type: "text" as const, text: "Error: days must be a positive number" }],
            isError: true,
          };
        }
        const raw = await api.getAccountHistory(validChainId, account_address, days);
        const result = { history: Array.isArray(raw) ? raw : [] };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
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

  server.registerTool(
    "read.account.pnl",
    {
      annotations: {
        title: "Get Account PnL",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get PnL (cost basis) and yield earned for an Arcadia account. Returns lifetime totals: cost basis vs current value (negative cost_basis = net profit withdrawn), net transfers per token, total yield earned in USD and per token. cost_basis, current_value, cost_diff are in USD (human-readable). Per-token fields (net_transfers, summed_yields_earned) are in raw token units.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: AccountPnlOutput,
    },
    async ({ account_address, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        const [pnlRaw, yieldRaw] = await Promise.all([
          api.getPnlCostBasis(validChainId, account_address),
          api.getYieldEarned(validChainId, account_address),
        ]);

        const {
          direct_deposits: _,
          flashaction_deposits,
          flashaction_withdrawals,
          direct_withdrawals,
          yield_withdrawals,
          ...pnl
        } = pnlRaw as Record<string, unknown>;
        if (Array.isArray(flashaction_deposits) && flashaction_deposits.length > 0)
          (pnl as Record<string, unknown>).flashaction_deposit_count = flashaction_deposits.length;
        if (Array.isArray(flashaction_withdrawals) && flashaction_withdrawals.length > 0)
          (pnl as Record<string, unknown>).flashaction_withdrawal_count =
            flashaction_withdrawals.length;
        if (Array.isArray(direct_withdrawals) && direct_withdrawals.length > 0)
          (pnl as Record<string, unknown>).direct_withdrawal_count = direct_withdrawals.length;
        if (Array.isArray(yield_withdrawals) && yield_withdrawals.length > 0)
          (pnl as Record<string, unknown>).yield_withdrawal_count = yield_withdrawals.length;

        const {
          daily_yields: _dy,
          daily_yields_usd: _dyu,
          ...yieldData
        } = yieldRaw as Record<string, unknown>;

        const result = { pnl_cost_basis: pnl, yield_earned: yieldData };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
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
