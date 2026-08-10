import { z } from "zod";

const Transaction = z.object({
  to: z.string(),
  data: z.string(),
  value: z.string(),
  chainId: z.number(),
});

export const SimpleTransactionOutput = z.object({
  description: z.string(),
  transaction: Transaction,
  predicted_account_address: z.string().optional(),
});

export const BatchedTransactionOutput = z.object({
  description: z.string().optional(),
  transaction: Transaction,
  tenderly_sim_url: z.string().optional(),
  tenderly_sim_status: z.enum(["success", "failure", "unavailable"]).optional(),
  expected_value_change: z.string().optional(),
  before: z
    .object({ total_account_value: z.string(), used_margin: z.string() })
    .passthrough()
    .optional(),
  after: z
    .object({ total_account_value: z.string(), used_margin: z.string() })
    .passthrough()
    .optional(),
});

const ResolvedManager = z.object({
  manager: z.string(),
  address: z.string(),
  enabled: z.boolean(),
  strategy: z.string().nullish(),
  serving_intents: z.array(z.string()),
});

const DiffEntry = z.object({
  manager: z.string(),
  address: z.string(),
  enabled: z.boolean(),
});

export const AutomationsPlanOutput = z.object({
  description: z.string(),
  valid: z.boolean(),
  errors: z.array(z.object({ rule: z.string(), severity: z.string(), reason: z.string() })),
  warnings: z.array(z.string()),
  human_summary: z.array(z.string()),
  plan: z.array(ResolvedManager),
  diff: z
    .object({
      added: z.array(DiffEntry),
      removed: z.array(DiffEntry),
      updated: z.array(DiffEntry),
    })
    .optional(),
  transaction: Transaction.optional(),
  simulation_url: z.string().optional(),
  tenderly_sim_status: z.enum(["success", "failure", "unavailable"]).optional(),
  no_changes_needed: z.boolean().optional(),
});

export const AutomationsStateOutput = z.object({
  account: z.string(),
  chain_id: z.number(),
  read_ok: z.boolean(),
  inferred_intents: z.array(z.string()),
  enabled: z.array(z.record(z.unknown())),
  deprecated: z.array(z.record(z.unknown())),
  merkl: z.record(z.unknown()).nullish(),
  warnings: z.array(z.string()),
});

export const WalletBalancesOutput = z.object({
  native: z.object({
    symbol: z.string(),
    balance: z.string(),
    formatted: z.string(),
  }),
  tokens: z.array(
    z.object({
      address: z.string(),
      symbol: z.string(),
      decimals: z.number(),
      balance: z.string(),
      formatted: z.string(),
    }),
  ),
});

export const WalletAllowanceOutput = z.object({
  tokens: z.array(
    z.object({
      address: z.string(),
      symbol: z.string(),
      decimals: z.number(),
      allowance: z.string(),
      formatted: z.string(),
      is_max_approval: z.boolean(),
    }),
  ),
});

export const DevSendOutput = z.object({
  signer: z.string(),
  txHash: z.string(),
  status: z.string(),
  blockNumber: z.number(),
  gasLimit: z.number(),
  gasUsed: z.number(),
});

export const AccountInfoOutput = z
  .object({
    account_version: z.number().nullable(),
    overview: z.record(z.unknown()).nullable(),
    liquidation_price: z.record(z.unknown()).nullable(),
    automation: z.record(z.unknown()).optional(),
    context_notes: z.array(z.string()).optional(),
  })
  .passthrough();

export const AccountListOutput = z.object({
  accounts: z.array(z.record(z.unknown())),
});

export const AccountHistoryOutput = z.object({
  history: z.array(z.record(z.unknown())),
});

export const AccountPnlOutput = z.object({
  pnl_cost_basis: z.record(z.unknown()),
  yield_earned: z.record(z.unknown()),
});

export const AssetListOutput = z.object({
  total: z.number(),
  assets: z.array(
    z.object({
      address: z.unknown(),
      symbol: z.unknown(),
      decimals: z.unknown(),
      type: z.unknown(),
    }),
  ),
});

export const AssetPricesOutput = z.object({
  prices: z.record(z.number()),
});

export const PoolListOutput = z.object({
  pools: z.array(z.record(z.unknown())),
  context_notes: z.array(z.string()).optional(),
});

export const PoolDetailOutput = z.object({
  pool: z.record(z.unknown()),
  apy_history: z.array(z.record(z.unknown())),
});

export const PointsWalletOutput = z.object({}).passthrough();

export const PointsLeaderboardOutput = z.object({
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  leaderboard: z.array(z.record(z.unknown())),
});

export const StrategyListOutput = z.object({
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  strategies: z.array(z.record(z.unknown())),
  context_notes: z.array(z.string()).optional(),
});

export const StrategyDetailOutput = z.object({}).passthrough();

export const StrategyRecommendationOutput = z.object({}).passthrough();

export const GuideOutput = z.object({
  topic: z.string(),
  content: z.string(),
});

export const IntentsListOutput = z.object({
  automations: z.array(z.record(z.unknown())),
  shared_params: z.array(z.string()),
  usage: z.string(),
});
