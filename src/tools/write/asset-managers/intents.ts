import { z } from "zod";
import { CHAIN_ID_DESCRIPTION } from "../../../config/chains.js";
import type { AutomationPositionContext } from "../../../types/api.js";

// Zod mirrors of the backend's intent union
// (fallback-asset-managers/app/services/automation_config/intents.py).
// The backend is the single source of truth for resolution, compatibility
// validation and metadata encoding; these schemas only shape the wire body.

const YIELD_TOKEN = z.enum(["token0", "token1", "reward"]);
const POOL_TOKEN = z.enum(["token0", "token1"]);

const ENABLED = z
  .boolean()
  .default(true)
  .describe("False disables this intent's managers instead of enabling them.");

const POSITION_ID = z
  .number()
  .int()
  .optional()
  .describe(
    "LP position (NFT) id this intent applies to. Also used to auto-fetch position context.",
  );

const CompoundFeesIntent = z.object({
  kind: z.literal("compound_fees"),
  enabled: ENABLED,
  position_id: POSITION_ID,
  tokens: z
    .array(YIELD_TOKEN)
    .optional()
    .describe(
      "Which tokens' yield to reinvest. Omit for all yielding tokens. 'reward' only exists on a staked position whose reward token is not a pool token. " +
        "Every yielding token must be assigned to either compound_fees or claim_rewards, so if you scope this to a subset you must add a claim_rewards intent covering the rest.",
    ),
});

const ClaimRewardsIntent = z.object({
  kind: z.literal("claim_rewards"),
  enabled: ENABLED,
  position_id: POSITION_ID,
  config: z
    .object({
      mode: z
        .enum(["as_earned", "convert_to"])
        .default("as_earned")
        .describe(
          "as_earned pays out the claimed tokens as-is; convert_to swaps them to buy_token via CowSwap. Use convert_tokens to convert only some of them.",
        ),
      destination: z
        .enum(["account", "wallet"])
        .default("account")
        .describe(
          "Payout target ('wallet' is the owner EOA). A wallet payout is only allowed for a pure as-earned claim: nothing converted, and every yielding token claimed. " +
            "Any convert, or a claim scoped to a subset of tokens, must use 'account' because CowSwap settles there.",
        ),
      buy_token: z
        .string()
        .optional()
        .describe(
          "ERC20 to swap into. Required whenever any token is being converted. It cannot be a token you also compound, one of the tokens being converted, or a token folded by add_to_lp.",
        ),
      recipient: z
        .string()
        .optional()
        .describe(
          "Explicit payout address. Overrides destination when set, and is subject to the same pure-as-earned rule as a wallet payout unless it equals the account address.",
        ),
      tokens: z
        .array(YIELD_TOKEN)
        .optional()
        .describe(
          "Which tokens' yield to claim out. Omit for all yielding tokens. A token cannot be both claimed and compounded, and every yielding token must be assigned to one of the two.",
        ),
      convert_tokens: z
        .array(YIELD_TOKEN)
        .optional()
        .describe(
          "Subset of this intent's claimed tokens to swap to buy_token; the rest are claimed as-earned. Must be a subset of `tokens`. " +
            "Omit to defer to mode (convert_to converts all claimed tokens, as_earned converts none). Use this for a partial convert, e.g. tokens: ['token0','reward'] with convert_tokens: ['reward'] swaps only the reward and claims token0 as-is.",
        ),
    })
    .default({}),
});

const AddToLpIntent = z.object({
  kind: z.literal("add_to_lp"),
  enabled: ENABLED,
  position_id: POSITION_ID,
  tokens: z
    .array(POOL_TOKEN)
    .optional()
    .describe(
      "Which pool tokens' idle account balance to fold into the LP. Omit for both. Folding is opt-in per token, and a folded token cannot be the buy_token of a claim_rewards convert.",
    ),
});

const ClaimMerklIntent = z.object({
  kind: z.literal("claim_merkl"),
  enabled: ENABLED,
  position_id: POSITION_ID,
  config: z
    .object({
      destination: z.enum(["account", "wallet"]).default("account"),
      reward_recipient: z
        .string()
        .optional()
        .describe("Explicit recipient address. Overrides destination when set."),
    })
    .default({}),
});

const OutOfRangeStrategy = z.object({
  kind: z.literal("out_of_range"),
  optimal_token0_ratio: z
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .default(500_000)
    .describe(
      "Target token0 composition after a rebalance, 1e6-scaled: 500000 = 50% (balanced, the default), 750000 = 75% token0, 0 = all token1.",
    ),
  trigger_lower_tick_ratio: z
    .number()
    .int()
    .default(0)
    .describe(
      "Offset from tick_lower as a fraction of the position's tick range, 1e6-scaled. This is TICK distance, not price: 50000 shifts the trigger by 5% of (tick_upper - tick_lower) ticks, which is not 5% of price. " +
        "0 = trigger exactly at the boundary. Positive (e.g. 50000) puts the trigger outside the position so price must travel further beyond the range before rebalancing. Negative (e.g. -50000) puts it inside, firing preemptively while price is still in range.",
    ),
  trigger_upper_tick_ratio: z
    .number()
    .int()
    .default(0)
    .describe(
      "Same as trigger_lower_tick_ratio, for tick_upper. The two are independent, so asymmetric configs are valid (e.g. lower -50000, upper 0 rebalances early on the downside but only at the boundary on the upside).",
    ),
  min_rebalance_time: z
    .number()
    .int()
    .default(3600)
    .describe("Cooldown in seconds between rebalances."),
  max_rebalance_time: z
    .number()
    .int()
    .default(10 ** 12)
    .describe("Seconds before a rebalance is forced. Default is effectively disabled."),
});

const POLStrategy = z.object({
  kind: z.literal("protocol_owned_liquidity"),
  initial_range: z.number().int().default(200_000),
  base_range: z.number().int().default(50_000),
  k1: z.number().int().default(0),
  k2: z.number().int().default(0),
  rebalance_threshold: z.number().int().default(25_000),
  limit_order_withdrawal_threshold: z.number().int().default(50_000),
  fraction_excess_to_limit_order: z.number().int().default(500_000),
  deadzone: z.number().int().default(20_000),
  target_token0_ratio: z.number().int().default(500_000),
});

const TakeProfitStrategy = z.object({
  kind: z.literal("take_profit"),
  profit_token: z.enum(["token0", "token1"]).default("token0"),
  take_profit_trigger_type: z.enum(["", "fixed", "relative"]).default("fixed"),
  take_profit_trigger_threshold: z.number().int().default(0),
  take_profit_reposition_mode: z.enum(["", "anchor_tick", "shift_range"]).default("anchor_tick"),
  has_reversal: z.boolean().default(false),
  reversal_trigger_type: z.enum(["", "fixed", "relative"]).default(""),
  reversal_trigger_threshold: z.number().int().default(0),
  reversal_reposition_mode: z.enum(["", "anchor_tick", "shift_range"]).default(""),
});

const RebalanceIntent = z.object({
  kind: z.literal("rebalance"),
  enabled: ENABLED,
  position_id: POSITION_ID,
  strategy: z
    .discriminatedUnion("kind", [OutOfRangeStrategy, POLStrategy, TakeProfitStrategy])
    .default({ kind: "out_of_range" })
    .describe(
      "out_of_range repositions when price leaves the range; take_profit runs on the dedicated profit-taker contract; protocol_owned_liquidity is the POL strategy.",
    ),
  max_tolerance: z
    .number()
    .int()
    .min(0)
    .max(10 ** 18)
    .optional()
    .describe(
      "Max price deviation (MEV/slippage cap), 1e18-scaled: 1e18 = 100%, so 5000000000000000 = 0.5% (the default) and 50000000000000000 = 5%. Omit for the pool's default. AAA pools are floored at 5%.",
    ),
  min_liquidity_ratio: z
    .number()
    .int()
    .min(0)
    .max(10 ** 18)
    .optional()
    .describe(
      "Min fraction of liquidity that must survive a rebalance, 1e18-scaled: 990000000000000000 = 99% (the default), i.e. at most 1% value loss. Omit for the default.",
    ),
});

export const AUTOMATION_INTENT = z
  .discriminatedUnion("kind", [
    CompoundFeesIntent,
    ClaimRewardsIntent,
    AddToLpIntent,
    ClaimMerklIntent,
    RebalanceIntent,
  ])
  .describe("One user-facing automation intent.");

// The read tools report a position's protocol in the dex_protocol vocabulary
// (slipstream, staked_slipstream_v3, uniV3, ...) which folds staking into the
// name. The backend splits those into protocol + is_staked, so accept both
// spellings here and translate rather than making callers do it.
const DEX_PROTOCOL_TO_CONTEXT: Record<string, { protocol: string; is_staked: boolean }> = {
  slipstream: { protocol: "slipstream_v1", is_staked: false },
  slipstream_v2: { protocol: "slipstream_v2", is_staked: false },
  slipstream_v3: { protocol: "slipstream_v3", is_staked: false },
  staked_slipstream: { protocol: "slipstream_v1", is_staked: true },
  staked_slipstream_v2: { protocol: "slipstream_v2", is_staked: true },
  staked_slipstream_v3: { protocol: "slipstream_v3", is_staked: true },
  uniV3: { protocol: "uniswap_v3", is_staked: false },
  uniV4: { protocol: "uniswap_v4", is_staked: false },
};

const PROTOCOL_VALUES = [
  "slipstream_v1",
  "slipstream_v2",
  "slipstream_v3",
  "uniswap_v3",
  "uniswap_v4",
  ...Object.keys(DEX_PROTOCOL_TO_CONTEXT),
] as const;

// Position context. The backend auto-fetches anything omitted when position_id
// is supplied, and anything explicitly passed wins over the fetched value.
export const POSITION_CONTEXT_SCHEMA = {
  position_id: z
    .number()
    .int()
    .optional()
    .describe(
      "LP position (NFT) id, as listed in assets[] by read.account.info. Supply this and the backend fetches protocol, staked flag, tokens and reward tokens for you. Strongly preferred over passing the position fields by hand.",
    ),
  protocol: z
    .enum(PROTOCOL_VALUES)
    .optional()
    .describe(
      "Position's DEX protocol. Only needed when position_id is omitted. Accepts the dex_protocol values the read tools return (slipstream, staked_slipstream_v3, uniV3, ...), which imply is_staked, as well as the canonical slipstream_v1 / uniswap_v3 spellings.",
    ),
  is_staked: z
    .boolean()
    .optional()
    .describe("Whether the LP position is staked. Implied by a staked_* protocol value."),
  token0: z.string().optional().describe("Pool token0 address."),
  token1: z.string().optional().describe("Pool token1 address."),
  reward_tokens: z.array(z.string()).optional().describe("Staking reward token addresses."),
  owner: z
    .string()
    .optional()
    .describe("Account owner EOA. Used to resolve wallet payout targets."),
};

export const CHAIN_ID_SCHEMA = z.number().default(8453).describe(CHAIN_ID_DESCRIPTION);

type PositionContextInput = {
  position_id?: number;
  protocol?: string;
  is_staked?: boolean;
  token0?: string;
  token1?: string;
  reward_tokens?: string[];
  owner?: string;
};

/** Strip undefined position-context fields so the backend's auto-fetch kicks in. */
export function positionContext(params: PositionContextInput): AutomationPositionContext {
  const ctx: AutomationPositionContext = {};
  if (params.position_id !== undefined) ctx.position_id = params.position_id;
  if (params.protocol !== undefined) {
    const translated = DEX_PROTOCOL_TO_CONTEXT[params.protocol];
    ctx.protocol = translated ? translated.protocol : params.protocol;
    if (translated) ctx.is_staked = translated.is_staked;
  }
  // An explicit is_staked always wins over the one implied by the protocol spelling.
  if (params.is_staked !== undefined) ctx.is_staked = params.is_staked;
  if (params.token0 !== undefined) ctx.token0 = params.token0;
  if (params.token1 !== undefined) ctx.token1 = params.token1;
  if (params.reward_tokens !== undefined) ctx.reward_tokens = params.reward_tokens;
  if (params.owner !== undefined) ctx.owner = params.owner;
  return ctx;
}
