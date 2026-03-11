import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../../config/chains.js";
import { MINIMAL_STRATEGY_HOOK, getAmProtocolAddress } from "../../../config/addresses.js";
import { validateAddress, validateChainId } from "../../../utils/validation.js";
import {
  REBALANCER_INITIATOR,
  encodeRebalancerMetadata,
  encodeRebalancerCallbackData,
  disabledIntent,
  type EncodedIntent,
} from "./encoding.js";
import { POOL_PROTOCOL_SCHEMA, poolProtocolToAmKey, formatResult } from "./shared.js";

export function registerRebalancerTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "write.asset_managers.rebalancer",
    {
      annotations: {
        title: "Encode Rebalancer Automation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Encode args for the rebalancer automation. When the LP position goes out of range, Arcadia's bot repositions it centered on the current price. All pending fees and staking rewards are claimed and compounded into the new position. Strategy config: 'default' (all params at defaults) uses when_out_of_range — rebalances exactly when price exits range. 'custom' (any param differs) uses time_and_price_based_triggers — adds configurable trigger offsets, cooldowns, and token composition. Returns { asset_managers, statuses, datas } — pass to write.account.set_asset_managers to build the unsigned tx. Combinable: merge arrays from multiple intent tools to configure several automations in one tx.",
      inputSchema: {
        pool_protocol: POOL_PROTOCOL_SCHEMA,
        enabled: z.boolean().default(true).describe("True to enable, false to disable"),
        compound_leftovers: z
          .enum(["all", "none", "token0", "token1"])
          .default("all")
          .describe('What to reinvest after rebalance (default "all" = compound both)'),
        optimal_token0_ratio: z
          .number()
          .int()
          .min(0)
          .max(1000000)
          .default(500000)
          .describe("Target token0 composition scaled by 1e6: 500000 = 50%, 750000 = 75%"),
        trigger_lower_ratio: z
          .number()
          .int()
          .default(0)
          .describe(
            "Offset from the lower tick to trigger rebalance, scaled by 1e6. 0 = at boundary. Positive (e.g. 50000 = 5%) triggers BEFORE price exits range (preemptive). Negative (e.g. -50000 = -5%) triggers AFTER price has moved beyond the range (delayed).",
          ),
        trigger_upper_ratio: z
          .number()
          .int()
          .default(0)
          .describe(
            "Offset from the upper tick to trigger rebalance, scaled by 1e6. 0 = at boundary. Positive (e.g. 50000 = 5%) triggers BEFORE price exits range (preemptive). Negative (e.g. -50000 = -5%) triggers AFTER price has moved beyond the range (delayed).",
          ),
        min_rebalance_time: z
          .number()
          .int()
          .default(3600)
          .describe("Min seconds between rebalances (default 3600 = 1 hour)"),
        max_rebalance_time: z
          .number()
          .int()
          .default(1e12)
          .describe("Max seconds before forced rebalance (default 1e12 = effectively disabled)"),
        strategy_hook: z
          .string()
          .optional()
          .describe(
            "Strategy hook address. Defaults to minimal hook. Only override for custom hooks.",
          ),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validChainId = validateChainId(params.chain_id);
        const amKey = poolProtocolToAmKey(params.pool_protocol);
        const amAddress = getAmProtocolAddress(validChainId, "rebalancers", amKey);

        if (!params.enabled) {
          return formatResult(disabledIntent([amAddress]));
        }

        const metaData = encodeRebalancerMetadata({
          compoundLeftovers: params.compound_leftovers,
          optimalToken0Ratio: params.optimal_token0_ratio,
          triggerLowerRatio: params.trigger_lower_ratio,
          triggerUpperRatio: params.trigger_upper_ratio,
          minRebalanceTime: params.min_rebalance_time,
          maxRebalanceTime: params.max_rebalance_time,
        });

        const strategyHook = params.strategy_hook
          ? validateAddress(params.strategy_hook, "strategy_hook")
          : MINIMAL_STRATEGY_HOOK;

        const callbackData = encodeRebalancerCallbackData(
          REBALANCER_INITIATOR,
          strategyHook,
          metaData,
        );

        const result: EncodedIntent = {
          asset_managers: [amAddress],
          statuses: [true],
          datas: [callbackData],
        };

        return formatResult(result);
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
