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
