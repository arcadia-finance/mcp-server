import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { validateChainId } from "../../utils/validation.js";
import { IntentsListOutput } from "../output-schemas.js";
import type { ChainId } from "../../config/chains.js";

const POOL_PROTOCOLS = [
  "slipstream",
  "slipstream_v2",
  "staked_slipstream",
  "staked_slipstream_v2",
  "uniV3",
  "uniV4",
] as const;

interface RequiredParam {
  name: string;
  type: string;
  values?: readonly string[];
  hint?: string;
}

interface AutomationIntent {
  id: string;
  tool: string;
  description: string;
  sets_managers: string[];
  required_params: RequiredParam[];
  optional_params: string[];
  chains: ChainId[];
}

const DEX_PROTOCOL_PARAM: RequiredParam = {
  name: "dex_protocol",
  type: "enum",
  values: POOL_PROTOCOLS,
  hint: "LP DEX protocol of the position",
};

const ALL_CHAINS: ChainId[] = [8453, 130];
const BASE_ONLY: ChainId[] = [8453];

const INTENTS: AutomationIntent[] = [
  {
    id: "rebalancer",
    tool: "write.asset_manager.rebalancer",
    description:
      "Repositions LP when out of range, compounds fees and rewards. Configurable triggers, cooldowns, and token composition.",
    sets_managers: ["rebalancer"],
    required_params: [DEX_PROTOCOL_PARAM],
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
    tool: "write.asset_manager.compounder",
    description:
      "Claims LP fees and reinvests into position. Pair with rebalancer for compounding between rebalances.",
    sets_managers: ["compounder"],
    required_params: [DEX_PROTOCOL_PARAM],
    optional_params: [],
    chains: ALL_CHAINS,
  },
  {
    id: "compounder_staked",
    tool: "write.asset_manager.compounder_staked",
    description:
      "Compounder + CowSwap for staked LP positions (e.g. staked Slipstream/Aerodrome). Claims staked rewards (AERO) — staked positions earn staking rewards only, not LP fees. Swaps rewards to a target token via CowSwap batch auction, then compounds back into the LP. Base only.",
    sets_managers: ["cow_swapper", "compounder"],
    required_params: [
      DEX_PROTOCOL_PARAM,
      { name: "sell_tokens", type: "string[]", hint: "array of ERC20 addresses to sell" },
      { name: "buy_token", type: "string", hint: "ERC20 address to buy" },
    ],
    optional_params: [],
    chains: BASE_ONLY,
  },
  {
    id: "yield_claimer",
    tool: "write.asset_manager.yield_claimer",
    description: "Claims pending fees/emissions and sends to a designated recipient address.",
    sets_managers: ["yield_claimer"],
    required_params: [
      DEX_PROTOCOL_PARAM,
      { name: "fee_recipient", type: "address", hint: "address to receive claimed fees" },
    ],
    optional_params: [],
    chains: ALL_CHAINS,
  },
  {
    id: "yield_claimer_cowswap",
    tool: "write.asset_manager.yield_claimer_cowswap",
    description:
      "Yield claimer coupled with CowSwap. Claims fees, swaps to target token via batch auction, sends to recipient.",
    sets_managers: ["cow_swapper", "yield_claimer"],
    required_params: [
      DEX_PROTOCOL_PARAM,
      { name: "sell_tokens", type: "string[]", hint: "array of ERC20 addresses to sell" },
      { name: "buy_token", type: "string", hint: "ERC20 address to buy" },
      { name: "fee_recipient", type: "address", hint: "address to receive claimed fees" },
    ],
    optional_params: [],
    chains: BASE_ONLY,
  },
  {
    id: "cow_swapper",
    tool: "write.asset_manager.cow_swapper",
    description:
      "Standalone CowSwap mode. Swap any ERC20 via batch auctions. Each swap requires account owner signature.",
    sets_managers: ["cow_swapper"],
    required_params: [],
    optional_params: [],
    chains: BASE_ONLY,
  },
  {
    id: "merkl_operator",
    tool: "write.asset_manager.merkl_operator",
    description:
      "Claims external Merkl incentive rewards. Enable when pool has active Merkl campaigns. Combine with rebalancer for extra yield.",
    sets_managers: ["merkl_operator"],
    required_params: [
      { name: "reward_recipient", type: "address", hint: "address to receive Merkl rewards" },
    ],
    optional_params: [],
    chains: ALL_CHAINS,
  },
];

export function registerAssetManagerTools(server: McpServer) {
  server.registerTool(
    "read.asset_manager.intents",
    {
      annotations: {
        title: "List Available Automations",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "List all available automation intents with their tool names, required parameters, and supported chains. Use this to discover which automations can be configured and what each one does. Each intent has a corresponding write.asset_manager.{id} tool that returns encoded args. To apply automations, call the intent tools then pass the combined result to write.account.set_asset_managers. All intent tools accept enabled=false to disable. Multiple intents can be combined by merging their returned arrays into a single set_asset_managers call.",
      inputSchema: {
        chain_id: z
          .number()
          .optional()
          .describe("Filter to automations available on this chain. Omit to see all."),
      },
      outputSchema: IntentsListOutput,
    },
    async (params) => {
      try {
        let filtered = INTENTS;
        if (params.chain_id !== undefined) {
          const validChainId = validateChainId(params.chain_id);
          filtered = INTENTS.filter((i) => i.chains.includes(validChainId));
        }

        const result = {
          automations: filtered,
          shared_params: ["enabled (boolean, default true)", "chain_id (number, default 8453)"],
          usage:
            "1. Call the intent tool (e.g. write.asset_manager.rebalancer) with enabled + chain_id to get encoded args. 2. Optionally merge arrays from multiple intent calls. 3. Pass to write.account.set_asset_managers to build the unsigned tx.",
        };
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
