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

export interface BundleCalldataResponse {
  fx_call_to: string;
  fx_call: string;
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
  tenderly_sim_status?: string;
  tenderly_sim_error?: string;
  debt_to_take?: number;
  before?: { total_account_value: number; used_margin: number };
  after?: { total_account_value: number; used_margin: number };
  total_value_in?: number;
  total_value_out?: number;
}
