import { encodeAbiParameters } from "viem";

// Arcadia's bot initiator addresses per asset manager type
export const REBALANCER_INITIATOR = "0x163CcA8F161CBBB401a96aDf4Cbf4D74f3faD1Ed" as const;
export const COMPOUNDER_INITIATOR = "0xb0f46DB8B96e265C1D93396444Eee952086C6f3D" as const;
export const CLAIMER_INITIATOR = "0xDc9B596ce15F859673D1Be72e2Aadd41DD3aC4fE" as const;
export const MERKL_INITIATOR = "0x521541D932B15631e8a1B037f17457C801722bA0" as const;
export const COWSWAPPER_INITIATOR = "0x163CcA8F161CBBB401a96aDf4Cbf4D74f3faD1Ed" as const;

// Default fee limits matching the dapp defaults
export const DEFAULT_MAX_CLAIM_FEE = BigInt("100000000000000000"); // 10%
export const DEFAULT_MAX_SWAP_FEE = BigInt("500000000000000"); // 0.05%
export const DEFAULT_MAX_TOLERANCE = BigInt("5000000000000000"); // 0.5%
export const DEFAULT_MIN_LIQUIDITY_RATIO = BigInt("990000000000000000"); // 99%

export interface EncodedIntent {
  asset_managers: string[];
  statuses: boolean[];
  datas: `0x${string}`[];
  strategy_name?: string;
}

export function disabledIntent(
  addresses: string[],
  description: string,
): EncodedIntent & { description: string } {
  return {
    description,
    asset_managers: addresses,
    statuses: addresses.map(() => false),
    datas: addresses.map(() => "0x"),
  };
}

// Outer metadata wrapper: encode(uint8 version, string strategy, bytes data)
export function encodeOuterMetadata(strategy: string, innerData: `0x${string}`): `0x${string}` {
  return encodeAbiParameters(
    [
      { name: "version", type: "uint8" },
      { name: "strategy", type: "string" },
      { name: "data", type: "bytes" },
    ],
    [1, strategy, innerData],
  );
}

// ── Rebalancer ──────────────────────────────────────────────────

export interface RebalancerParams {
  compoundLeftovers: "all" | "none" | "token0" | "token1";
  optimalToken0Ratio: number;
  triggerLowerRatio: number;
  triggerUpperRatio: number;
  minRebalanceTime: number;
  maxRebalanceTime: number;
}

export const DEFAULT_REBALANCER_PARAMS: RebalancerParams = {
  compoundLeftovers: "all",
  optimalToken0Ratio: 500000,
  triggerLowerRatio: 0,
  triggerUpperRatio: 0,
  minRebalanceTime: 3600,
  maxRebalanceTime: 1e12,
};

function isDefault(params: RebalancerParams): boolean {
  const d = DEFAULT_REBALANCER_PARAMS;
  return (
    params.compoundLeftovers === d.compoundLeftovers &&
    params.optimalToken0Ratio === d.optimalToken0Ratio &&
    params.triggerLowerRatio === d.triggerLowerRatio &&
    params.triggerUpperRatio === d.triggerUpperRatio &&
    params.minRebalanceTime === d.minRebalanceTime &&
    params.maxRebalanceTime === d.maxRebalanceTime
  );
}

export function encodeRebalancerMetadata(params: RebalancerParams): `0x${string}` {
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
      params.compoundLeftovers,
      params.optimalToken0Ratio,
      params.triggerLowerRatio,
      params.triggerUpperRatio,
      BigInt(params.minRebalanceTime),
      BigInt(params.maxRebalanceTime),
    ],
  );

  const strategyName = isDefault(params) ? "default" : "custom";
  return encodeOuterMetadata(strategyName, strategyParams);
}

export function encodeRebalancerCallbackData(
  initiator: `0x${string}`,
  strategyHook: `0x${string}`,
  metaData: `0x${string}`,
): `0x${string}` {
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

// ── Compounder ──────────────────────────────────────────────────

export function encodeCompounderCallbackData(initiator: `0x${string}`): `0x${string}` {
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

// ── Yield Claimer ───────────────────────────────────────────────

export function encodeYieldClaimerCallbackData(
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

// ── Merkl Operator ──────────────────────────────────────────────

export function encodeMerklOperatorCallbackData(
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

// ── CowSwapper ──────────────────────────────────────────────────

export function encodeCowSwapTokenMetadata(
  strategy: string,
  sellTokens: `0x${string}`[],
  buyToken: `0x${string}`,
): `0x${string}` {
  const innerData = encodeAbiParameters(
    [
      { name: "sellTokens", type: "address[]" },
      { name: "buyToken", type: "address" },
    ],
    [sellTokens, buyToken],
  );
  return encodeOuterMetadata(strategy, innerData);
}

export function encodeCoupledStrategyMetadata(strategy: string): `0x${string}` {
  return encodeOuterMetadata(strategy, "0x");
}

// Compounder callback data with coupled cowswap metadata
export function encodeCompounderCoupledCallbackData(
  initiator: `0x${string}`,
  strategy: string,
): `0x${string}` {
  const metaData = encodeCoupledStrategyMetadata(strategy);
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
      metaData,
    ],
  );
}

// Yield claimer callback data with coupled cowswap metadata
export function encodeYieldClaimerCoupledCallbackData(
  initiator: `0x${string}`,
  feeRecipient: `0x${string}`,
  strategy: string,
): `0x${string}` {
  const metaData = encodeCoupledStrategyMetadata(strategy);
  return encodeAbiParameters(
    [
      { name: "initiator", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "maxClaimFee", type: "uint256" },
      { name: "metaData_", type: "bytes" },
    ],
    [initiator, feeRecipient, DEFAULT_MAX_CLAIM_FEE, metaData],
  );
}
