import type {
  ApiResponse,
  ApiListResponse,
  BundleCalldataRequest,
  BundleCalldataResponse,
} from "../types/api.js";

const DEFAULT_BASE_URL = "https://api.arcadia.finance";
const API_PREFIX = "/v1/api";
const DEFAULT_HEADERS = { "User-Agent": "arcadia-mcp/0.1.0" };

export class ArcadiaApiClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl?: string, timeout = 30_000) {
    this.baseUrl = (baseUrl ?? process.env.ARCADIA_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = timeout;
  }

  private async throwApiError(resp: Response, path: string): Promise<never> {
    const body = await resp.text().catch(() => "");
    const status = resp.status;

    let hint = "";
    if (status === 400) {
      hint =
        " Check that all parameters are valid (correct address format, supported chain_id, valid amounts).";
    } else if (status === 404) {
      hint = " The resource was not found. Verify the account/pool/strategy exists on this chain.";
    } else if (status === 422) {
      hint = " Invalid input. The API rejected the request parameters.";
    } else if (status === 500) {
      hint =
        " Internal backend error. Common causes: account has no creditor (spot account used where margin account is required), unsupported asset type, or transient backend issue. Retry once — if it persists, check account type and parameters.";
    } else if (status === 502 || status === 503 || status === 504) {
      hint = " Backend is temporarily unavailable. Retry after a few seconds.";
    }

    const detail = body.length > 500 ? body.slice(0, 500) + "..." : body;
    throw new Error(
      `Arcadia API error (${status} on ${path}): ${detail || resp.statusText}${hint}`,
    );
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
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!resp.ok) await this.throwApiError(resp, path);
    return resp.json() as Promise<T>;
  }

  private async post<T = ApiResponse>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${API_PREFIX}${path}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!resp.ok) await this.throwApiError(resp, path);
    return resp.json() as Promise<T>;
  }

  // ── Accounts ─────────────────────────────────────────────────────

  async getAccounts(chainId: number, owner: string) {
    return this.get<{ accounts: ApiListResponse }>("/accounts", { chain_id: chainId, owner });
  }

  async getAccountOverview(chainId: number, account: string) {
    return this.get("/accounts/overview", { chain_id: chainId, account });
  }

  async getLiquidationPrice(chainId: number, account: string) {
    return this.get("/accounts/liquidation", { chain_id: chainId, account });
  }

  async getAccountHistory(chainId: number, account: string, days = 14) {
    const end = Math.floor(Date.now() / 1000);
    const start = end - days * 86400;
    return this.get("/accounts/historic_account_values", {
      chain_id: chainId,
      account_address: account,
      start,
      end,
    });
  }

  async getLeaderboard(chainId: number) {
    return this.get<ApiListResponse>("/accounts/leaderboard", { chain_id: chainId });
  }

  // ── PnL & Yield ─────────────────────────────────────────────────

  async getPnlCostBasis(chainId: number, account: string) {
    return this.get("/accounts/pnl_cost_basis", { chain_id: chainId, account_address: account });
  }

  async getYieldEarned(chainId: number, account: string) {
    return this.get("/accounts/yield_earned", { chain_id: chainId, account_address: account });
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
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!resp.ok) await this.throwApiError(resp, "/assets/prices");
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
    const { asset_id, asset_address, ...rest } = params;
    return this.get("/bundles/decrease_liquidity", {
      ...rest,
      asset: asset_address,
      position_id: asset_id,
    } as Record<string, string | number>);
  }

  async getStakeCalldata(params: {
    chain_id: number;
    account_address: string;
    asset_address: string;
    asset_id: number;
  }) {
    const { asset_id, asset_address, ...rest } = params;
    return this.get("/bundles/stake", {
      ...rest,
      asset: asset_address,
      position_id: asset_id,
    } as Record<string, string | number>);
  }

  async getClaimCalldata(params: {
    chain_id: number;
    account_address: string;
    asset_address: string;
    asset_id: number;
  }) {
    const { asset_id, asset_address, ...rest } = params;
    return this.get("/bundles/claim", {
      ...rest,
      asset: asset_address,
      position_id: asset_id,
    } as Record<string, string | number>);
  }
}
