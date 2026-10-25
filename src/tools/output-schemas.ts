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
  expected_value_change_unavailable: z.string().optional(),
  price_checks: z.array(z.object({ pool: z.string(), status: z.string() }).loose()).optional(),
  before: z.object({ total_account_value: z.string(), used_margin: z.string() }).loose().optional(),
  after: z.object({ total_account_value: z.string(), used_margin: z.string() }).loose().optional(),
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
  preview_only: z.boolean().optional(),
});

export const AutomationsStateOutput = z.object({
  account: z.string(),
  chain_id: z.number(),
  read_ok: z.boolean(),
  inferred_intents: z.array(z.string()),
  enabled: z.array(z.record(z.string(), z.unknown())),
  deprecated: z.array(z.record(z.string(), z.unknown())),
  merkl: z.record(z.string(), z.unknown()).nullish(),
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
    overview: z.record(z.string(), z.unknown()).nullable(),
    liquidation_price: z.record(z.string(), z.unknown()).nullable(),
    automation: z.record(z.string(), z.unknown()).optional(),
    context_notes: z.array(z.string()).optional(),
  })
  .loose();

export const AccountListOutput = z.object({
  accounts: z.array(z.record(z.string(), z.unknown())),
});

export const AccountHistoryOutput = z.object({
  history: z.array(z.record(z.string(), z.unknown())),
});

export const AccountPnlOutput = z.object({
  pnl_cost_basis: z.record(z.string(), z.unknown()),
  yield_earned: z.record(z.string(), z.unknown()),
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
  prices: z.record(z.string(), z.number()),
});

export const PoolListOutput = z.object({
  pools: z.array(z.record(z.string(), z.unknown())),
  context_notes: z.array(z.string()).optional(),
});

export const PoolDetailOutput = z.object({
  pool: z.record(z.string(), z.unknown()),
  apy_history: z.array(z.record(z.string(), z.unknown())),
});

export const PointsWalletOutput = z.object({}).loose();

export const PointsLeaderboardOutput = z.object({
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  leaderboard: z.array(z.record(z.string(), z.unknown())),
});

export const StrategyListOutput = z.object({
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  strategies: z.array(z.record(z.string(), z.unknown())),
  context_notes: z.array(z.string()).optional(),
});

export const StrategyDetailOutput = z.object({}).loose();

export const StrategyRecommendationOutput = z.object({}).loose();

export const GuideOutput = z.object({
  topic: z.string(),
  content: z.string(),
});

export const IntentsListOutput = z.object({
  automations: z.array(z.record(z.string(), z.unknown())),
  availability_error: z.string().optional(),
  shared_params: z.array(z.string()),
  usage: z.string(),
});

const ManagerToReconnect = z.object({
  kind: z.string(),
  old_address: z.string(),
  new_address: z.string().nullable(),
  initiator: z.string().nullable(),
});

const AeroPlanStatus = z.enum([
  "ready",
  "choices_required",
  "waiting",
  "not_open",
  "nothing_to_upgrade",
]);

export const AeroUpgradeCandidatesOutput = z.object({
  chain_id: z.number(),
  owner_address: z.string().nullable(),
  opens_at: z.number().nullable(),
  checked_at: z.number(),
  accounts: z.array(
    z.object({
      account_address: z.string(),
      is_spot: z.boolean(),
      status: AeroPlanStatus,
      positions: z.number(),
      old_aero: z.string(),
      movable: z.number(),
      waiting: z.number(),
      blocked: z.number(),
    }),
  ),
  failed_accounts: z.array(z.object({ account_address: z.string(), error: z.string() })),
});

const AeroUpgradePlanOutput = z.object({
  description: z.string(),
  account_address: z.string(),
  // The account owner: the only address that can send the transaction.
  owner: z.string(),
  status: AeroPlanStatus,
  status_note: z.string(),
  // Absent while nothing can go now, and when the transaction's simulation failed.
  transaction: Transaction.optional(),
  gas: z.string().optional(),
  error: z.string().optional(),
  tenderly_sim_url: z.string().optional(),
  tenderly_sim_status: z.enum(["success", "failure", "unavailable"]),
  simulation_note: z.string().optional(),
  // Net per token, from the simulation: positive into the account, negative out.
  asset_changes: z.array(
    z.object({
      token: z.string(),
      standard: z.string(),
      amount: z.string(),
      decimals: z.number().nullable(),
      protocol: z.string().nullable(),
    }),
  ),
  opens_at: z.number().nullable(),
  price_tolerance_bps: z.number(),
  items: z.array(z.record(z.string(), z.unknown())),
  managers_to_reconnect: z.array(ManagerToReconnect),
  old_managers_still_needed: z.boolean(),
  next_steps: z.array(z.string()),
});

// One account: the plan fields. Several accounts: `results`, one plan or
// `{account_address, status: "error", error}` per account.
export const AeroUpgradeOutput = AeroUpgradePlanOutput.partial().extend({
  description: z.string(),
  chain_id: z.number().optional(),
  max_gas_per_tx: z.number().optional(),
  results: z.array(z.record(z.string(), z.unknown())).optional(),
  multisends: z.array(z.array(z.string())).optional(),
  next_steps: z.array(z.string()),
});

export const VeloUpgradeOutput = z.object({
  description: z.string(),
  transactions: z.array(z.object({ description: z.string(), transaction: Transaction })),
  destination_chain_id: z.number(),
  recipient: z.string(),
  old_token: z.string(),
  new_token: z.string(),
  amount_in: z.string(),
  expected_amount_out: z.string(),
  fee_wei: z.string(),
});
