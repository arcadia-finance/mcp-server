import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";
import { AutomationsStateOutput, IntentsListOutput } from "../output-schemas.js";

// Static catalog of the intent vocabulary the backend compiles. Availability is
// account-specific and comes from the backend; this only documents the shapes so
// an agent can build a request without an account in hand.
interface IntentDoc {
  kind: string;
  description: string;
  params: string[];
  needs_position_context: boolean;
}

const INTENT_CATALOG: IntentDoc[] = [
  {
    kind: "compound_fees",
    description:
      "Reinvest earned fees and rewards back into the LP. On a staked position whose reward token is not a pool token, the reward is swapped to a pool token via CowSwap and folded in.",
    params: ["tokens (token0|token1|reward)[], omit for all yielding tokens"],
    needs_position_context: true,
  },
  {
    kind: "claim_rewards",
    description:
      "Claim pending yield out of the position, either as-earned or converted to a single token via CowSwap.",
    params: [
      "config.mode (as_earned|convert_to)",
      "config.destination (account|wallet)",
      "config.buy_token (address, required when converting)",
      "config.recipient (address, overrides destination)",
      "config.tokens (token0|token1|reward)[]",
      "config.convert_tokens (token0|token1|reward)[]: convert a subset, claim the rest as-earned",
    ],
    needs_position_context: true,
  },
  {
    kind: "add_to_lp",
    description:
      "Fold idle pool-token balances (deposits, rebalance leftovers) back into the LP. Opt-in per token.",
    params: ["tokens (token0|token1)[], omit for both"],
    needs_position_context: true,
  },
  {
    kind: "claim_merkl",
    description:
      "Auto-claim Merkl incentive rewards. Independent of the other automations and needs no position context.",
    params: ["config.destination (account|wallet)", "config.reward_recipient (address)"],
    needs_position_context: false,
  },
  {
    kind: "rebalance",
    description:
      "Reposition the LP when it moves out of range, or on a take-profit / POL strategy. Claims and compounds yield as part of the rebalance.",
    params: [
      "strategy.kind (out_of_range|take_profit|protocol_owned_liquidity)",
      "out_of_range: optimal_token0_ratio, trigger_lower_tick_ratio, trigger_upper_tick_ratio, min_rebalance_time, max_rebalance_time",
      "take_profit: profit_token, take_profit_trigger_type/threshold, take_profit_reposition_mode, has_reversal, reversal_*",
      "protocol_owned_liquidity: initial_range, base_range, k1, k2, rebalance_threshold, limit_order_withdrawal_threshold, fraction_excess_to_limit_order, deadzone, target_token0_ratio",
      "max_tolerance, min_liquidity_ratio (1e18-scaled overrides)",
    ],
    needs_position_context: true,
  },
];

const USAGE =
  "Build an intents array from these kinds and pass it to write.account.automations (full desired state) or write.account.automations_delta (change one automation, leave the rest alone). The backend resolves the asset managers, validates the combination and returns the unsigned transaction.";

export function registerAssetManagerTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "read.asset_manager.intents",
    {
      annotations: {
        title: "List Available Automations",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "List the automation intents Arcadia supports, with the parameters each one accepts. " +
        "Pass account_address to also get per-account availability: which intents can be enabled right now and, for any that cannot, the compatibility rule blocking it. " +
        "Pass position_id as well to scope availability to one LP position. Without account_address this returns the catalog only.",
      outputSchema: IntentsListOutput,
      inputSchema: {
        account_address: z
          .string()
          .optional()
          .describe("Arcadia account address. Include it to get live per-account availability."),
        position_id: z
          .number()
          .int()
          .optional()
          .describe("LP position (NFT) id to scope availability to. Requires account_address."),
        chain_id: z
          .number()
          .default(8453)
          .describe("Chain id: 8453 Base, 130 Unichain, 10 Optimism"),
      },
    },
    async (params) => {
      try {
        const chainId = validateChainId(params.chain_id);

        if (params.position_id !== undefined && !params.account_address) {
          throw new Error("position_id requires account_address.");
        }

        let automations: Record<string, unknown>[] = INTENT_CATALOG.map((i) => ({ ...i }));

        if (params.account_address) {
          const account = validateAddress(params.account_address, "account_address");
          const live = await api.getAvailableAutomations(account, chainId, params.position_id);
          const byKind = new Map(live.intents.map((i) => [i.kind, i]));
          automations = automations.map((doc) => {
            const entry = byKind.get(doc.kind as string);
            return entry
              ? { ...doc, available: entry.available, unavailable_reason: entry.reason ?? null }
              : doc;
          });
        }

        const result = {
          automations,
          shared_params: [
            "enabled (boolean, default true): set false to disable an intent's managers",
            "position_id (number): scopes the intent and auto-fetches position context",
            "chain_id (number, default 8453)",
          ],
          usage: USAGE,
        };

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
    "read.asset_manager.current",
    {
      annotations: {
        title: "Read Current Account Automations",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Read which asset managers are currently enabled on an account, with their decoded on-chain configuration. " +
        "Returns the active managers (address, protocol, initiator, decoded strategy metadata, slippage and value-loss caps, fee recipient), the intents they map to, and Merkl claim state including whether reward tokens still need registering. " +
        "Managers from superseded deployments are listed separately under `deprecated`: pass their addresses to write.account.automations_delta to clear them, or run write.account.automations which disables them as part of the save. " +
        "read_ok is false when chain state could not be read, in which case the result is unreliable rather than empty.",
      outputSchema: AutomationsStateOutput,
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z
          .number()
          .default(8453)
          .describe("Chain id: 8453 Base, 130 Unichain, 10 Optimism"),
      },
    },
    async (params) => {
      try {
        const chainId = validateChainId(params.chain_id);
        const account = validateAddress(params.account_address, "account_address");
        const state = await api.getCurrentAutomations(account, chainId);

        const all = state.enabled ?? [];
        const result = {
          account: state.account,
          chain_id: state.chain_id,
          read_ok: state.read_ok,
          inferred_intents: state.inferred_intents ?? [],
          enabled: all.filter((m) => !m.deprecated) as unknown as Record<string, unknown>[],
          deprecated: all.filter((m) => m.deprecated) as unknown as Record<string, unknown>[],
          merkl: (state.merkl ?? null) as Record<string, unknown> | null,
          warnings: state.warnings ?? [],
        };

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
}
