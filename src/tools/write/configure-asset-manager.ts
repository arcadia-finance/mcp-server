import { z } from "zod";
import { encodeAbiParameters, encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { ASSET_MANAGERS, MINIMAL_STRATEGY_HOOK } from "../../config/addresses.js";
import { accountAbi } from "../../abis/index.js";
import { appendDataSuffix } from "../../utils/attribution.js";

// Arcadia's bot initiator addresses per asset manager type
const REBALANCER_INITIATOR = "0x163CcA8F161CBBB401a96aDf4Cbf4D74f3faD1Ed" as const;
const COMPOUNDER_INITIATOR = "0xb0f46DB8B96e265C1D93396444Eee952086C6f3D" as const;
const CLAIMER_INITIATOR = "0xDc9B596ce15F859673D1Be72e2Aadd41DD3aC4fE" as const;
const MERKL_INITIATOR = "0x521541D932B15631e8a1B037f17457C801722bA0" as const;

// Default fee limits matching the dapp defaults
const DEFAULT_MAX_CLAIM_FEE = BigInt("100000000000000000"); // 10% (0.1 * 1e18)
const DEFAULT_MAX_SWAP_FEE = BigInt("500000000000000"); // 0.05% (0.0005 * 1e18)
const DEFAULT_MAX_TOLERANCE = BigInt("5000000000000000"); // 0.5% (0.005 * 1e18)
const DEFAULT_MIN_LIQUIDITY_RATIO = BigInt("990000000000000000"); // 99% (0.99 * 1e18)

function encodeRebalancerMetadata(
  triggerLowerRatio: number,
  triggerUpperRatio: number,
  compoundLeftovers: "all" | "none" | "token0" | "token1",
  minRebalanceTime: number,
): `0x${string}` {
  const strategyParams = encodeAbiParameters(
    [
      { name: "compound_leftovers", type: "string" },
      { name: "optimal_token0_ratio", type: "uint32" },
      { name: "trigger_tick_lower_ratio", type: "int32" },
      { name: "trigger_tick_upper_ratio", type: "int32" },
      { name: "min_rebalance_time", type: "uint64" },
      { name: "max_rebalance_time", type: "uint64" },
    ],
    [
      compoundLeftovers,
      500000, // 50% optimal token0 ratio (default)
      triggerLowerRatio,
      triggerUpperRatio,
      BigInt(minRebalanceTime),
      BigInt(1e12), // effectively no max
    ],
  );

  return encodeAbiParameters(
    [
      { name: "version", type: "uint8" },
      { name: "strategy", type: "string" },
      { name: "data", type: "bytes" },
    ],
    [1, triggerLowerRatio === 0 && triggerUpperRatio === 0 ? "default" : "custom", strategyParams],
  );
}

function encodeRebalancerCallbackData(
  initiator: `0x${string}`,
  strategyHook: `0x${string}`,
  metaData: `0x${string}`,
): `0x${string}` {
  // strategyData must be ABI-encoded empty bytes, not raw "0x".
  // The hook's setStrategy does abi.decode(strategyData, (bytes)) which needs
  // at least 64 bytes (offset + length) to decode successfully.
  const emptyStrategyData = encodeAbiParameters([{ type: "bytes" }], ["0x"]);

  return encodeAbiParameters(
    [
      { name: "initiator", type: "address" },
      { name: "maxClaimFee", type: "uint256" },
      { name: "maxSwapFee", type: "uint256" },
      { name: "maxTolerance", type: "uint256" },
      { name: "minLiquidityRatio", type: "uint256" },
      { name: "strategyHook", type: "address" },
      { name: "strategyData", type: "bytes" },
      { name: "metaData_", type: "bytes" },
    ],
    [
      initiator,
      DEFAULT_MAX_CLAIM_FEE,
      DEFAULT_MAX_SWAP_FEE,
      DEFAULT_MAX_TOLERANCE,
      DEFAULT_MIN_LIQUIDITY_RATIO,
      strategyHook,
      emptyStrategyData,
      metaData,
    ],
  );
}

function encodeCompounderCallbackData(initiator: `0x${string}`): `0x${string}` {
  return encodeAbiParameters(
    [
      { name: "initiator", type: "address" },
      { name: "maxClaimFee", type: "uint256" },
      { name: "maxSwapFee", type: "uint256" },
      { name: "maxTolerance", type: "uint256" },
      { name: "minLiquidityRatio", type: "uint256" },
      { name: "metaData_", type: "bytes" },
    ],
    [
      initiator,
      DEFAULT_MAX_CLAIM_FEE,
      DEFAULT_MAX_SWAP_FEE,
      DEFAULT_MAX_TOLERANCE,
      DEFAULT_MIN_LIQUIDITY_RATIO,
      "0x",
    ],
  );
}

function encodeYieldClaimerCallbackData(
  initiator: `0x${string}`,
  feeRecipient: `0x${string}`,
): `0x${string}` {
  return encodeAbiParameters(
    [
      { name: "initiator", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "maxClaimFee", type: "uint256" },
      { name: "metaData_", type: "bytes" },
    ],
    [initiator, feeRecipient, DEFAULT_MAX_CLAIM_FEE, "0x"],
  );
}

function encodeMerklOperatorCallbackData(
  initiator: `0x${string}`,
  rewardRecipient: `0x${string}`,
): `0x${string}` {
  return encodeAbiParameters(
    [
      { name: "initiator", type: "address" },
      { name: "rewardRecipient", type: "address" },
      { name: "maxClaimFee", type: "uint256" },
      { name: "metaData_", type: "bytes" },
    ],
    [initiator, rewardRecipient, DEFAULT_MAX_CLAIM_FEE, "0x"],
  );
}

type AmType = "rebalancer" | "compounder" | "yield_claimer" | "merkl_operator";
type PoolProtocol = "slipstream" | "slipstream_v2" | "uniV3" | "uniV4";

const PROTOCOL_TO_AM_KEY: Record<PoolProtocol, keyof typeof ASSET_MANAGERS.base.rebalancers> = {
  slipstream: "slipstreamV1",
  slipstream_v2: "slipstreamV2",
  uniV3: "uniV3",
  uniV4: "uniV4",
};

function resolveAmAddress(amType: AmType, protocol: PoolProtocol): string | undefined {
  const key = PROTOCOL_TO_AM_KEY[protocol];
  switch (amType) {
    case "rebalancer":
      return ASSET_MANAGERS.base.rebalancers[key];
    case "compounder":
      return ASSET_MANAGERS.base.compounders[key];
    case "yield_claimer":
      return ASSET_MANAGERS.base.yieldClaimers[key];
    case "merkl_operator":
      return ASSET_MANAGERS.base.merklOperator;
  }
}

export function registerConfigureAssetManagerTool(
  server: McpServer,
  _chains: Record<ChainId, ChainConfig>,
) {
  server.tool(
    "build_configure_asset_manager_tx",
    "Build an unsigned transaction to enable AND configure an asset manager on an Arcadia V3/V4 account. Unlike build_set_asset_manager_tx (which only grants permission), this also sets the initiator, fee limits, and strategy parameters in one transaction via setAssetManagers. Supports rebalancer (with trigger ratios and compound mode), compounder, yield claimer (with fee recipient), and merkl operator (with reward recipient). Pass pool_protocol to auto-resolve the correct AM address, or pass asset_manager_address directly. For addresses, call get_guide('automation'). Returns { transaction: { to, data, value, chainId } }.",
    {
      account_address: z.string().describe("Arcadia account address (must be V3 or V4)"),
      asset_manager_address: z
        .string()
        .optional()
        .describe("Asset manager contract address. Optional if pool_protocol is provided."),
      pool_protocol: z
        .enum(["slipstream", "slipstream_v2", "uniV3", "uniV4"])
        .optional()
        .describe(
          "LP protocol — auto-resolves the correct AM address. Use instead of asset_manager_address.",
        ),
      am_type: z
        .enum(["rebalancer", "compounder", "yield_claimer", "merkl_operator"])
        .describe("Type of asset manager"),
      // Rebalancer-specific
      trigger_lower_ratio: z
        .number()
        .int()
        .default(0)
        .describe(
          "Rebalancer: how far below the current lower tick to trigger rebalance, as int32 * 1e6 (default 0 = trigger exactly at boundary). Positive values trigger before going out of range.",
        ),
      trigger_upper_ratio: z
        .number()
        .int()
        .default(0)
        .describe(
          "Rebalancer: how far above the current upper tick to trigger rebalance, as int32 * 1e6 (default 0 = trigger exactly at boundary). Positive values trigger before going out of range.",
        ),
      compound_leftovers: z
        .enum(["all", "none", "token0", "token1"])
        .default("all")
        .describe(
          'Rebalancer: what to do with leftover tokens after rebalance (default "all" = compound both)',
        ),
      min_rebalance_time: z
        .number()
        .int()
        .default(3600)
        .describe("Rebalancer: minimum seconds between rebalances (default 3600 = 1 hour)"),
      strategy_hook: z
        .string()
        .optional()
        .describe(
          "Rebalancer: strategy hook address. Defaults to minimal hook (0x13beD1A58d87c0454872656c5328103aAe5eB86A). Only override for POL or custom hooks.",
        ),
      // Yield Claimer / Merkl Operator
      fee_recipient: z
        .string()
        .optional()
        .describe("yield_claimer: address to receive claimed fees (required for yield_claimer)"),
      reward_recipient: z
        .string()
        .optional()
        .describe("merkl_operator: address to receive Merkl rewards (required for merkl_operator)"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async (params) => {
      try {
        // Resolve asset manager address from pool_protocol or direct address
        const amAddress =
          params.asset_manager_address ??
          (params.pool_protocol
            ? resolveAmAddress(params.am_type, params.pool_protocol)
            : undefined);
        if (!amAddress) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Provide asset_manager_address or pool_protocol to resolve the AM address.",
              },
            ],
            isError: true,
          };
        }

        let callbackData: `0x${string}`;

        switch (params.am_type) {
          case "rebalancer": {
            const metaData = encodeRebalancerMetadata(
              params.trigger_lower_ratio,
              params.trigger_upper_ratio,
              params.compound_leftovers,
              params.min_rebalance_time,
            );
            const strategyHook = (params.strategy_hook ?? MINIMAL_STRATEGY_HOOK) as `0x${string}`;
            callbackData = encodeRebalancerCallbackData(
              REBALANCER_INITIATOR,
              strategyHook,
              metaData,
            );
            break;
          }
          case "compounder": {
            callbackData = encodeCompounderCallbackData(COMPOUNDER_INITIATOR);
            break;
          }
          case "yield_claimer": {
            if (!params.fee_recipient) {
              throw new Error("fee_recipient is required for yield_claimer");
            }
            callbackData = encodeYieldClaimerCallbackData(
              CLAIMER_INITIATOR,
              params.fee_recipient as `0x${string}`,
            );
            break;
          }
          case "merkl_operator": {
            if (!params.reward_recipient) {
              throw new Error("reward_recipient is required for merkl_operator");
            }
            callbackData = encodeMerklOperatorCallbackData(
              MERKL_INITIATOR,
              params.reward_recipient as `0x${string}`,
            );
            break;
          }
        }

        const data = appendDataSuffix(
          encodeFunctionData({
            abi: accountAbi,
            functionName: "setAssetManagers",
            args: [[amAddress as `0x${string}`], [true], [callbackData]],
          }),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: `Configure and enable ${params.am_type} ${amAddress} on account ${params.account_address}`,
                  transaction: {
                    to: params.account_address as `0x${string}`,
                    data,
                    value: "0",
                    chainId: params.chain_id,
                  },
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
