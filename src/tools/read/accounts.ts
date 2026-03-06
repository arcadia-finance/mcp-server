import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { accountAbi } from "../../abis/index.js";
import { getPublicClient } from "../../clients/chain.js";
import { getChainAmChecks } from "../../config/addresses.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";

function trimOverview(overview: Record<string, unknown>): Record<string, unknown> {
  const trimmed = { ...overview };

  if (Array.isArray(trimmed.historic_actions)) {
    trimmed.historic_actions_count = (trimmed.historic_actions as unknown[]).length;
    delete trimmed.historic_actions;
  }

  if (Array.isArray(trimmed.assets)) {
    trimmed.assets = (trimmed.assets as Record<string, unknown>[]).map((a) => {
      const { related_strategies, asset_details: _ad, ...rest } = a;
      const asset: Record<string, unknown> = { ...rest };
      if (Array.isArray(related_strategies) && related_strategies.length > 0) {
        asset.strategy_count = related_strategies.length;
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
    "read.account_info",
    {
      annotations: {
        title: "Get Account Info",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get full overview of an Arcadia account: health factor, collateral value, debt, deposited assets, liquidation price, and automation status. Pass account_address for a specific account, or wallet_address to list all accounts owned by a wallet. Health factor = 1 - (used_margin / liquidation_value): 1 = no debt (safest), >0 = healthy, 0 = liquidation threshold, <0 = past liquidation. Higher is safer. On Base, also returns which asset managers are enabled (rebalancer, compounder, yield_claimer, merkl_operator, cow_swapper).",
      inputSchema: {
        account_address: z.string().optional().describe("Arcadia account address"),
        wallet_address: z
          .string()
          .optional()
          .describe(
            "Wallet address to list all owned accounts (returns summary: address, name). Call again with a specific account_address for full details like health factor, collateral, and debt.",
          ),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, wallet_address, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        if (wallet_address) {
          validateAddress(wallet_address, "wallet_address");
          const result = await api.getAccounts(validChainId, wallet_address);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }
        if (account_address) {
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
                results.forEach((r: { status: string; result?: boolean }, i: number) => {
                  if (r.status !== "success" || !r.result) return;
                  const check = amChecks[i];
                  if (check.protocol) {
                    out[check.group] = check.protocol;
                  } else {
                    out[check.group] = true;
                  }
                });
                return out;
              })
              .catch(() => null);
          }

          const result: Record<string, unknown> = {
            account_version: accountVersion,
            overview: overview ? trimOverview(overview as Record<string, unknown>) : null,
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
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Provide either account_address or wallet_address",
            },
          ],
          isError: true,
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
    "read.account_history",
    {
      annotations: {
        title: "Get Account History",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get historical collateral and debt values for an Arcadia account over time. Returns a time series of snapshots (timestamp, collateral_value, debt_value, net_value in USD). Useful for charting account performance over a period.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        days: z.number().default(14).describe("Number of days of history (default 14)"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, days, chain_id }) => {
      try {
        const result = await api.getAccountHistory(chain_id, account_address, days);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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
    "read.account_pnl",
    {
      annotations: {
        title: "Get Account PnL",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get PnL (cost basis) and yield earned for an Arcadia account. Returns lifetime totals: cost basis vs current value (negative cost_basis = net profit withdrawn), net transfers per token, total yield earned in USD and per token. All monetary values are in USD unless suffixed otherwise.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, chain_id }) => {
      try {
        const [pnlRaw, yieldRaw] = await Promise.all([
          api.getPnlCostBasis(chain_id, account_address),
          api.getYieldEarned(chain_id, account_address),
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

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ pnl_cost_basis: pnl, yield_earned: yieldData }, null, 2),
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
