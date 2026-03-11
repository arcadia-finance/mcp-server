import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateChainId } from "../../utils/validation.js";
import type { ChainId } from "../../config/chains.js";

const POOL_PROTOCOLS = [
  "slipstream",
  "slipstream_v2",
  "staked_slipstream",
  "staked_slipstream_v2",
  "uniV3",
  "uniV4",
] as const;

interface AutomationIntent {
  id: string;
  tool: string;
  description: string;
  sets_managers: string[];
  required_params: (string | { name: string; values: readonly string[] })[];
  optional_params: string[];
  chains: ChainId[];
}

const ALL_CHAINS: ChainId[] = [8453, 130];
const BASE_ONLY: ChainId[] = [8453];

const INTENTS: AutomationIntent[] = [
  {
    id: "rebalancer",
    tool: "write.asset_managers.rebalancer",
    description:
      "Repositions LP when out of range, compounds fees and rewards. Configurable triggers, cooldowns, and token composition.",
    sets_managers: ["rebalancer"],
    required_params: [{ name: "pool_protocol", values: POOL_PROTOCOLS }],
    optional_params: [
      "compound_leftovers",
      "optimal_token0_ratio",
      "trigger_lower_ratio",
      "trigger_upper_ratio",
      "min_rebalance_time",
      "max_rebalance_time",
      "strategy_hook",
    ],
    chains: ALL_CHAINS,
  },
  {
    id: "compounder",
    tool: "write.asset_managers.compounder",
    description:
      "Claims LP fees and reinvests into position. Pair with rebalancer for compounding between rebalances.",
    sets_managers: ["compounder"],
    required_params: [{ name: "pool_protocol", values: POOL_PROTOCOLS }],
    optional_params: [],
    chains: ALL_CHAINS,
  },
  {
    id: "compounder_staked",
    tool: "write.asset_managers.compounder_staked",
    description:
      "Compounder coupled with CowSwap. Claims staked rewards (AERO), swaps to target token via batch auction, compounds into LP.",
    sets_managers: ["cowswapper", "compounder"],
    required_params: [
      { name: "pool_protocol", values: POOL_PROTOCOLS },
      "sell_tokens",
      "buy_token",
    ],
    optional_params: [],
    chains: BASE_ONLY,
  },
  {
    id: "yield_claimer",
    tool: "write.asset_managers.yield_claimer",
    description: "Claims pending fees/emissions and sends to a designated recipient address.",
    sets_managers: ["yield_claimer"],
    required_params: [{ name: "pool_protocol", values: POOL_PROTOCOLS }, "fee_recipient"],
    optional_params: [],
    chains: ALL_CHAINS,
  },
  {
    id: "yield_claimer_cowswap",
    tool: "write.asset_managers.yield_claimer_cowswap",
    description:
      "Yield claimer coupled with CowSwap. Claims fees, swaps to target token via batch auction, sends to recipient.",
    sets_managers: ["cowswapper", "yield_claimer"],
    required_params: [
      { name: "pool_protocol", values: POOL_PROTOCOLS },
      "sell_tokens",
      "buy_token",
      "fee_recipient",
    ],
    optional_params: [],
    chains: BASE_ONLY,
  },
  {
    id: "cow_swapper",
    tool: "write.asset_managers.cow_swapper",
    description:
      "Standalone CowSwap mode. Swap any ERC20 via batch auctions. Each swap requires account owner signature.",
    sets_managers: ["cowswapper"],
    required_params: [],
    optional_params: [],
    chains: BASE_ONLY,
  },
  {
    id: "merkl_operator",
    tool: "write.asset_managers.merkl_operator",
    description:
      "Claims external Merkl incentive rewards. Enable when pool has active Merkl campaigns. Combine with rebalancer for extra yield.",
    sets_managers: ["merkl_operator"],
    required_params: ["reward_recipient"],
    optional_params: [],
    chains: ALL_CHAINS,
  },
];

export function registerAssetManagerTools(server: McpServer) {
  server.registerTool(
    "read.asset_managers.intents",
    {
      annotations: {
        title: "List Available Automations",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "List all available automation intents with their tool names, required parameters, and supported chains. Use this to discover which automations can be configured and what each one does. Each intent has a corresponding write.asset_managers.{id} tool that returns encoded args. To apply automations, call the intent tools then pass the combined result to write.account.set_asset_managers. All intent tools accept enabled=false to disable. Multiple intents can be combined by merging their returned arrays into a single set_asset_managers call.",
      inputSchema: {
        chain_id: z
          .number()
          .optional()
          .describe("Filter to automations available on this chain. Omit to see all."),
      },
    },
    async (params) => {
      try {
        let filtered = INTENTS;
        if (params.chain_id !== undefined) {
          const validChainId = validateChainId(params.chain_id);
          filtered = INTENTS.filter((i) => i.chains.includes(validChainId));
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  automations: filtered,
                  shared_params: [
                    "enabled (boolean, default true)",
                    "chain_id (number, default 8453)",
                  ],
                  usage:
                    "1. Call the intent tool (e.g. write.asset_managers.rebalancer) with enabled + chain_id to get encoded args. 2. Optionally merge arrays from multiple intent calls. 3. Pass to write.account.set_asset_managers to build the unsigned tx.",
                },
                null,
                2,
              ),
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
