// Response types from the Arcadia backend API.
// These are intentionally loose (Record-based) since the backend schema may evolve.
// Tools format the raw responses before returning them.

export type ApiResponse = Record<string, unknown>;
export type ApiListResponse = Record<string, unknown>[];

export interface BundleCalldataRequest {
  buy: Array<{
    asset_address: string;
    distribution: number;
    decimals: number;
    strategy_id: number;
    ticks?: { tick_lower: number; tick_upper: number };
  }>;
  sell: Array<{
    asset_address: string;
    amount: string;
    decimals: number;
    asset_id: number;
  }>;
  deposits: {
    addresses: string[];
    ids: number[];
    amounts: string[];
    decimals: number[];
  };
  withdraws: {
    addresses: string[];
    ids: number[];
    amounts: string[];
    decimals: number[];
  };
  wallet_address: string;
  account_address: string;
  numeraire: string;
  numeraire_decimals: number;
  debt: {
    take: boolean;
    leverage: number;
    repay: number;
    creditor: string;
  };
  chain_id: number;
  version: number;
  action_type: string;
  slippage: number;
}

// ── Automations ────────────────────────────────────────────────────
// Mirrors app/models/automation_config.py in the asset-manager backend.
// The backend resolves intents into a plan, validates compatibility and
// encodes the v3 packed metadata, so these stay pass-through shapes.

/** Yielding source a per-token scope can target. "reward" only exists on a staked position. */
export type YieldToken = "token0" | "token1" | "reward";
export type PoolToken = "token0" | "token1";

export interface AutomationPositionContext {
  owner?: string;
  position_id?: number;
  protocol?: string;
  is_staked?: boolean;
  token0?: string;
  token1?: string;
  reward_tokens?: string[];
}

export type AutomationIntent = {
  kind: "compound_fees" | "claim_rewards" | "add_to_lp" | "claim_merkl" | "rebalance";
  enabled?: boolean;
  position_id?: number;
  tokens?: YieldToken[] | PoolToken[];
  config?: Record<string, unknown>;
  strategy?: Record<string, unknown>;
  max_tolerance?: number;
  min_liquidity_ratio?: number;
};

export interface IntentsBody extends AutomationPositionContext {
  intents: AutomationIntent[];
}

export interface AutomationsDeltaBody extends AutomationPositionContext {
  enable: AutomationIntent[];
  disable: string[];
}

export interface ResolvedManager {
  manager: string;
  address: string;
  enabled: boolean;
  strategy?: string | null;
  serving_intents: string[];
}

export interface AutomationsPlanResponse {
  valid: boolean;
  errors: Array<{ rule: string; severity: "hard"; reason: string }>;
  warnings: string[];
  plan: ResolvedManager[];
  diff?: {
    added: Array<{ manager: string; address: string; enabled: boolean }>;
    removed: Array<{ manager: string; address: string; enabled: boolean }>;
    updated: Array<{ manager: string; address: string; enabled: boolean }>;
  };
  calldata: string | null;
  human_summary: string[];
  // Added by the api-v2 proxy on save/apply only, and only when calldata is non-null.
  // simulation_success is false both for a predicted revert and for a sim that could
  // not run (no `owner` supplied), so simulation_url is what distinguishes them.
  simulation_url?: string;
  simulation_success?: boolean;
}

export interface ActiveAssetManager {
  manager: string;
  protocol: string;
  address: string;
  enabled: boolean;
  deprecated: boolean;
  version?: string | null;
  metadata?: Record<string, unknown> | null;
  metadata_raw?: string | null;
  metadata_error?: string | null;
  active?: boolean | null;
  initiator?: string | null;
  slippage_percent?: number | null;
  value_loss_percent?: number | null;
  strategy_hook?: string | null;
  strategy_token0?: string | null;
  strategy_token1?: string | null;
  fee_recipient?: string | null;
  order_hook?: string | null;
  max_swap_fee?: string | null;
}

export interface AutomationsCurrentStateResponse {
  account: string;
  chain_id: number;
  enabled: ActiveAssetManager[];
  inferred_intents: string[];
  warnings: string[];
  merkl?: {
    address: string;
    connected: boolean;
    active: boolean;
    tokens_missing: boolean;
    reward_recipient?: string | null;
    distributor_address?: string | null;
  } | null;
  read_ok: boolean;
}

export interface AutomationsAvailableResponse {
  account: string;
  chain_id: number;
  intents: Array<{ kind: string; available: boolean; reason?: string | null }>;
}

export interface BundleCalldataResponse {
  fx_call_to: string;
  fx_call: string;
  calldata: string;
  actionHandler: string;
  actiondata: string;
  steps?: {
    inputs: unknown[];
    actions: unknown[];
    outputs: unknown[];
  };
  show_expected_change?: boolean;
  expected_value_change?: number;
  expected_change_status?: boolean;
  tenderly_sim_url?: string;
  tenderly_sim_status?: boolean;
  tenderly_sim_error?: string;
  debt_to_take?: number;
  before?: { total_account_value: number; used_margin: number };
  after?: { total_account_value: number; used_margin: number };
  total_value_in?: number;
  total_value_out?: number;
}

// ── Aero (MetadexCL V1) upgrade ──────────────────────────────────
// Mirrors arcadia-be-api-v2 app/controllers/aero_upgrade.py: the per-account
// candidates summary, the one-account plan with its flashAction, and the Safe
// batch. Addresses are EIP-55; raw token amounts and gas are decimal strings.

export type AeroPlanStatus =
  | "ready"
  | "choices_required"
  | "waiting"
  | "not_open"
  | "nothing_to_upgrade";
export type AeroItemStatus = "ready" | "choose" | "waiting" | "blocked";

export interface AeroReason {
  code: string;
  message: string;
}

/** An Aero pool a position can move to. Selectable when `disabled_reason` is null. */
export interface AeroPoolOption {
  pool: string;
  tick_spacing: number;
  /** tickSpacingToFee in pips, display only. */
  fee: number | null;
  strategy_id: number | null;
  /** A fraction (1 is 100%); null without enough history. */
  apy: number | null;
  tvl_usd: number | null;
  /** Too new for APY and TVL to mean anything yet. */
  is_new: boolean;
  tick_lower: number;
  tick_upper: number;
  range_widened: boolean;
  /** The same pool type at the position's own tick spacing. */
  default: boolean;
  /** Null until the calldata path ran the price check. */
  price_ok: boolean | null;
  price_deviation_bps: number | null;
  disabled_reason: AeroReason | null;
}

export interface AeroPositionItem {
  kind: "position";
  id: string;
  status: AeroItemStatus;
  source: {
    protocol: string;
    position_manager: string;
    position_id: number | string;
    pool: string;
    token0: string;
    token1: string;
    tick_lower: number;
    tick_upper: number;
    tick_spacing: number;
    /** Principal plus fees, raw. */
    amount0: string;
    amount1: string;
    value_usd: number | null;
  };
  target: {
    protocol: string;
    pool_type: number;
    pool: string;
    token0: string;
    token1: string;
    tick_lower: number;
    tick_upper: number;
    tick_spacing: number;
    fee: number | null;
    strategy_id: number | null;
    range_widened: boolean;
    tokens_flipped: boolean;
    /** How far, in bps, the pool's price may fall and rise before the mint's price check reverts. */
    price_band_bps: { below: number; above: number };
  } | null;
  options: AeroPoolOption[];
  rewards: { token: string; amount: string; becomes: string | null } | null;
  /** `converted` false: this upgrade returns the leg to the account as old AERO. */
  old_aero_leg: { amount: string; becomes: string; converted: boolean } | null;
  reason: AeroReason | null;
}

/** Loose old AERO in the account, converted 1:1 to the new AERO. */
export interface AeroTokenItem {
  kind: "token";
  id: string;
  status: "ready" | "waiting";
  amount: string;
  becomes: string;
  reason: AeroReason | null;
}

export type AeroUpgradeItem = AeroPositionItem | AeroTokenItem;

export interface AeroUpgradeCall {
  kind: "flash_action";
  to: string;
  data: string;
  value: string;
  gas: string | null;
}

/** Old Slipstream manager on the account and the Aero manager that replaces it. */
export interface AeroManagerToReconnect {
  kind: string;
  old_address: string;
  new_address: string | null;
  initiator: string | null;
}

/** What the simulated upgrade moves into (positive) or out of (negative) the account, net per token. */
export interface AeroAssetChange {
  token: string;
  standard: string;
  amount: string;
  decimals: number | null;
  protocol: string | null;
}

export interface AeroSimulation {
  status: boolean | null;
  url: string | null;
  error: string | null;
  asset_changes?: AeroAssetChange[];
}

export interface AeroUpgradePlanResponse {
  chain_id: number;
  account_address: string;
  owner: string;
  is_spot: boolean;
  status: AeroPlanStatus;
  opens_at: number | null;
  items: AeroUpgradeItem[];
  /** Empty until something can go now; otherwise the one flashAction. */
  calls: AeroUpgradeCall[];
  managers_to_reconnect: AeroManagerToReconnect[];
  /** True while a Slipstream position stays on the account after this upgrade. */
  old_managers_still_needed: boolean;
  simulation: AeroSimulation;
  price_tolerance_bps: number;
}

export interface AeroUpgradeBatchError {
  account_address: string;
  status: "error";
  error: string;
}

export interface AeroUpgradeBatchResponse {
  chain_id: number;
  results: Array<AeroUpgradePlanResponse | AeroUpgradeBatchError>;
  max_gas_per_tx: number;
  /** Accounts with a call, in request order, grouped so each group's summed gas stays at most max_gas_per_tx. */
  multisends: string[][];
}

export interface AeroUpgradeCandidateAccount {
  account_address: string;
  is_spot: boolean;
  status: AeroPlanStatus;
  /** Every Slipstream position on the account, whatever its status. */
  positions: number;
  /** Loose old AERO, raw. */
  old_aero: string;
  /** Positions that are ready or need a pool choice. */
  movable: number;
  /** Waiting positions, plus the loose old AERO when it waits. */
  waiting: number;
  blocked: number;
}

/** Accounts without a Slipstream position or old AERO are left out. */
export interface AeroUpgradeCandidatesResponse {
  chain_id: number;
  owner_address: string | null;
  opens_at: number | null;
  checked_at: number;
  accounts: AeroUpgradeCandidateAccount[];
  /** Accounts whose plan could not be built. */
  failed_accounts: Array<{ account_address: string; error: string }>;
}

export interface VeloUpgradeResponse {
  chain_id: number;
  destination_chain_id: number;
  owner: string;
  recipient: string;
  migration: string;
  entrypoint: string;
  old_token: string;
  new_token: string;
  amount_in: string;
  expected_amount_out: string;
  fee_quote_wei: string;
  fee_wei: string;
  wallet_balance: string;
  allowance: string;
  calls: Array<{ to: string; data: string; value: string }>;
}
