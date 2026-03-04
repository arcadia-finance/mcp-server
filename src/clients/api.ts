import type {
  ApiResponse,
  ApiListResponse,
  BundleCalldataRequest,
  BundleCalldataResponse,
} from "../types/api.js";

const DEFAULT_BASE_URL = "https://api.arcadia.finance";
const API_PREFIX = "/v1/api";

export class ArcadiaApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout = 30_000) {
    this.baseUrl = (baseUrl ?? process.env.ARCADIA_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = timeout;
  }

  private async get<T = ApiResponse>(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${API_PREFIX}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    }
    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Arcadia API ${resp.status} ${resp.statusText}: ${body}`);
    }
    return resp.json() as Promise<T>;
  }

  private async post<T = ApiResponse>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${API_PREFIX}${path}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Arcadia API ${resp.status} ${resp.statusText}: ${text}`);
    }
    return resp.json() as Promise<T>;
  }

  // ── Accounts ─────────────────────────────────────────────────────

  async getAccounts(chainId: number, owner: string) {
    return this.get<{ accounts: ApiListResponse }>("/accounts", { chain_id: chainId, owner });
  }

  async getAccountOverview(chainId: number, account: string) {
    return this.get("/accounts/overview", { chain_id: chainId, account });
  }

  async getAccountSummary(chainId: number, owner: string) {
    return this.get("/accounts/detailed-accounts-summary", { chain_id: chainId, owner });
  }

  async getAccountValue(chainId: number, account: string) {
    return this.get("/accounts/value_of_account", { chain_id: chainId, account });
  }

  async getLiquidationPrice(chainId: number, account: string) {
    return this.get("/accounts/liquidation", { chain_id: chainId, account });
  }

  async getAccountHistory(chainId: number, account: string, days = 14) {
    return this.get("/accounts/historic_account_values", {
      chain_id: chainId,
      account_address: account,
      days,
    });
  }

  async getOwnerOverview(chainId: number, owner: string) {
    return this.get("/accounts/owner_overview", { chain_id: chainId, owner });
  }

  async getLeaderboard(chainId: number) {
    return this.get<ApiListResponse>("/accounts/leaderboard", { chain_id: chainId });
  }

  // ── PnL & Yield ─────────────────────────────────────────────────

  async getPnl(chainId: number, account: string) {
    return this.get("/pnl/total/account", { chain_id: chainId, account_address: account });
  }

  async getYield(chainId: number, account: string) {
    return this.get("/yield/total/account", { chain_id: chainId, account_address: account });
  }

  // ── Assets & Prices ─────────────────────────────────────────────

  async getAssets(chainId: number) {
    return this.get("/assets", { chain_id: chainId });
  }

  async getPrice(chainId: number, asset: string) {
    return this.get("/assets/price", { chain_id: chainId, asset });
  }

  async getPrices(chainId: number, assets: string[]) {
    const url = new URL(`${this.baseUrl}${API_PREFIX}/assets/prices`);
    url.searchParams.set("chain_id", String(chainId));
    for (const a of assets) {
      url.searchParams.append("assets", a);
    }
    const resp = await fetch(url.toString(), {
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Arcadia API ${resp.status} ${resp.statusText}: ${body}`);
    }
    return resp.json() as Promise<Record<string, number>>;
  }

  // ── Pools ────────────────────────────────────────────────────────

  async getPools(chainId: number) {
    return this.get<ApiListResponse>("/pools", { chain_id: chainId });
  }

  async getPoolsData(chainId: number) {
    return this.get<ApiListResponse>("/pools_data", { chain_id: chainId });
  }

  async getPoolApyHistory(chainId: number, poolAddress: string, days = 14) {
    return this.get("/pools/historic_apy", {
      chain_id: chainId,
      pool_address: poolAddress,
      days,
    });
  }

  // ── Strategies ───────────────────────────────────────────────────

  async getStrategies(chainId: number) {
    return this.get<ApiListResponse>("/strategies", { chain_id: chainId });
  }

  async getStrategyInfo(chainId: number, strategyId: number) {
    return this.get(`/strategies/${strategyId}/info`, { chain_id: chainId });
  }

  async getFeatured(chainId: number) {
    return this.get<ApiListResponse>("/featured", { chain_id: chainId });
  }

  // ── Points ───────────────────────────────────────────────────────

  async getPoints(wallet: string) {
    return this.get("/points", { wallet_address: wallet });
  }

  async getPointsLeaderboard() {
    return this.get<ApiListResponse>("/points/leaderboard");
  }

  // ── Recommendation ───────────────────────────────────────────────

  async getRecommendation(chainId: number, account: string) {
    return this.get("/recommendation", { chain_id: chainId, account });
  }

  // ── AAA Token ────────────────────────────────────────────────────

  async getCirculatingSupply() {
    return this.get<number>("/aaa/circulating_cmc");
  }

  async getTotalSupply() {
    return this.get<number>("/aaa/total_supply_cmc");
  }

  // ── Bundle / Calldata (for advanced write tools) ─────────────────

  async getBundleCalldata(body: BundleCalldataRequest) {
    return this.post<BundleCalldataResponse>("/bundles/calldata", body);
  }

  async getSwapCalldata(params: {
    amount_in: string;
    chain_id: number;
    account_address: string;
    asset_from: string;
    asset_to: string;
    slippage: number;
  }) {
    return this.get("/bundles/swap_calldata", params as Record<string, string | number>);
  }

  async getRepayCalldata(params: {
    amount_in: string;
    chain_id: number;
    account_address: string;
    asset_from: string;
    numeraire: string;
    creditor: string;
    slippage: number;
  }) {
    return this.get("/bundles/repay_calldata", params as Record<string, string | number>);
  }

  async getDecreaseLiquidityCalldata(params: {
    chain_id: number;
    account_address: string;
    asset_address: string;
    asset_id: number;
    adjustment: string;
  }) {
    const { asset_id, ...rest } = params;
    return this.get("/bundles/decrease_liquidity", {
      ...rest,
      position_id: asset_id,
    } as Record<string, string | number>);
  }

  async getStakeCalldata(params: {
    chain_id: number;
    account_address: string;
    asset_address: string;
    asset_id: number;
  }) {
    const { asset_id, ...rest } = params;
    return this.get("/bundles/stake", {
      ...rest,
      position_id: asset_id,
    } as Record<string, string | number>);
  }

  async getClaimCalldata(params: {
    chain_id: number;
    account_address: string;
    asset_address: string;
    asset_id: number;
  }) {
    const { asset_id, ...rest } = params;
    return this.get("/bundles/claim", {
      ...rest,
      position_id: asset_id,
    } as Record<string, string | number>);
  }
}
