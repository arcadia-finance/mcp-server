import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { CHAIN_ID_DESCRIPTION, type ChainId, type ChainConfig } from "../../config/chains.js";
import { accountAbi } from "../../abis/index.js";
import { getPublicClient } from "../../clients/chain.js";
import {
  AUTOMATION_GROUPS,
  backendProtocolToDexProtocol,
  GAS_RELAYER,
  positionManagerToDexProtocol,
} from "../../config/addresses.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";
import { AccountInfoOutput, AccountHistoryOutput, AccountPnlOutput } from "../output-schemas.js";

/**
 * Normalise `/accounts/historic_account_values` into a time series.
 *
 * The endpoint answers `{ values: { "<unix seconds>": <net value>, ... } }` — an
 * object keyed by timestamp, not an array. Coercing a non-array response to `[]`
 * therefore discarded every snapshot and reported it as "no history", which is
 * indistinguishable from an account that genuinely has none.
 *
 * Both shapes are accepted so this survives the endpoint changing, and anything
 * that is neither throws rather than reporting an empty series: a read that did
 * not work has to look different from a read that found nothing.
 */
export function normalizeAccountHistory(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];

  const values = (raw as { values?: unknown } | null | undefined)?.values;
  if (values && typeof values === "object" && !Array.isArray(values)) {
    return Object.entries(values as Record<string, unknown>)
      .map(([timestamp, netValue]) => ({
        timestamp: Number(timestamp),
        net_value: netValue,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  if (raw === null || raw === undefined) return [];

  throw new Error(
    `Unexpected account-history response shape: ${JSON.stringify(raw).slice(0, 200)}`,
  );
}

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
        const dexProtocol = positionManagerToDexProtocol(chainId, rest.address);
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
        "Get full overview of an Arcadia account: health factor, collateral value, debt, deposited assets, liquidation price, and automation status. Health factor = 1 - (used_margin / liquidation_value): 1 = no debt (safest), >0 = healthy, 0 = liquidation threshold, <0 = past liquidation. Higher is safer. " +
        "The `automation` object reports which asset managers are enabled (rebalancer, compounder, yield_claimer, cow_swapper, merkl_operator, gas_relayer), each as the position's dex_protocol when protocol-specific or true when account-level, plus `inferred_intents` (the automations those managers add up to), `merkl` claim state, and `deprecated_managers` for any superseded deployment still set on the account. Superseded managers should be cleared: write.account.automations disables them as part of a save. For the full decoded per-manager config use read.asset_manager.current. " +
        "LP positions in assets[] include a dex_protocol field (slipstream, slipstream_v2, slipstream_v3, staked_slipstream, staked_slipstream_v2, staked_slipstream_v3, uniV3, uniV4). To configure automations, prefer passing the position's id as position_id to write.account.automations, which resolves the protocol and tokens for you; the dex_protocol value is also accepted directly as its `protocol` param. Slipstream V2 is Base-only. V3 is available on Base and Optimism. Unichain supports only Slipstream V1, uniV3, and uniV4. " +
        "Numeric fields without a _usd suffix are in the account's numeraire token raw units (divide by 10^decimals: 6 for USDC, 18 for WETH, 8 for cbBTC). Fields ending in _usd are in USD with 18 decimals (divide by 1e18). health_factor is unitless. Asset amounts are raw token units. To list all accounts for a wallet, use read.wallet.accounts.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      },
      outputSchema: AccountInfoOutput,
    },
    async ({ account_address, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        const validAccount = validateAddress(account_address, "account_address");
        const client = getPublicClient(validChainId, chains);
        // The automations read is issued alongside the others rather than after, so
        // sourcing automation state from the backend costs no extra round-trip.
        const [overview, liquidation_price, accountVersion, automationState] = await Promise.all([
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
          api
            .getCurrentAutomations(validAccount, validChainId)
            .then((s) => ({ ok: true as const, state: s }))
            .catch((e: unknown) => ({ ok: false as const, error: e })),
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

        // Automation state comes from the backend's automations reader, which owns
        // the asset-manager address book (including superseded deployments) and
        // decodes each manager's on-chain config.
        let automation: Record<string, unknown> | null = null;
        if (!automationState.ok) {
          const e = automationState.error;
          notes.push(
            `Automation state unavailable: ${e instanceof Error ? e.message : String(e)}. Other account data is unaffected.`,
          );
        } else {
          const state = automationState.state;
          const managers = state.enabled ?? [];
          const out: Record<string, unknown> = {};
          for (const group of AUTOMATION_GROUPS) out[group] = false;

          let activeProtocol: string | null = null;
          for (const m of managers) {
            if (m.deprecated) continue;
            if (!m.protocol) {
              out[m.manager] = true; // account-level manager, no protocol to report
              continue;
            }
            const dexProtocol = backendProtocolToDexProtocol(m.protocol);
            if (!dexProtocol) {
              // A protocol this server does not know yet. Report it verbatim rather
              // than as `true`, which would misreport it as account-level.
              out[m.manager] = m.protocol;
              notes.push(
                `Automation state: unrecognised protocol "${m.protocol}" on the ${m.manager}, reported verbatim. This MCP server may be out of date.`,
              );
              continue;
            }
            out[m.manager] = dexProtocol;
            if (!activeProtocol) activeProtocol = dexProtocol;
          }
          if (activeProtocol) out.dex_protocol = activeProtocol;

          out.inferred_intents = state.inferred_intents ?? [];
          const deprecated = managers.filter((m) => m.deprecated);
          if (deprecated.length > 0) {
            out.deprecated_managers = deprecated.map((m) => ({
              manager: m.manager,
              address: m.address,
              version: m.version ?? null,
            }));
          }
          if (state.merkl) out.merkl = state.merkl;

          // The gas relayer is an asset manager but no intent configures it, so the
          // backend's reader does not cover it. Probe it directly to keep reporting it.
          const owner = (overview as Record<string, unknown> | null)?.owner as string | undefined;
          if (owner) {
            try {
              out.gas_relayer = await client.readContract({
                address: validAccount,
                abi: accountAbi,
                functionName: "isAssetManager",
                args: [owner as `0x${string}`, GAS_RELAYER],
              });
            } catch (relayerErr) {
              notes.push(
                `gas_relayer state could not be read: ${relayerErr instanceof Error ? relayerErr.message : String(relayerErr)}. Other automation fields are unaffected.`,
              );
            }
          }

          if (!state.read_ok) {
            notes.push(
              "Automation state could not be confirmed on-chain, so the automation object may be incomplete. Retry, or read it directly with read.asset_manager.current.",
            );
          }
          for (const w of state.warnings ?? []) notes.push(`Automation state: ${w}`);
          automation = out;
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
        "Get an Arcadia account's historical net value over time. Returns a time series of snapshots, oldest first, each `{ timestamp, net_value }` — `timestamp` is unix seconds and `net_value` is USD (human-readable, not raw units). Useful for charting account performance over a period. An empty `history` means the account has no snapshots in the window, not that the read failed.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        days: z.number().default(14).describe("Number of days of history (default 14)"),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
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
        const result = { history: normalizeAccountHistory(raw) };
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
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
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
