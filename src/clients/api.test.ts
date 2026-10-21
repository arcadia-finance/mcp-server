import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArcadiaApiClient, ArcadiaApiError } from "./api.js";

describe("ArcadiaApiClient error handling", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(status: number, body: string, statusText = "") {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status,
      statusText: statusText || `Status ${status}`,
      text: async () => body,
    });
  }

  it("400 hints at invalid parameters", async () => {
    mockFetch(400, "bad request");
    const api = new ArcadiaApiClient();
    await expect(api.getAssets(8453)).rejects.toThrow(/Check that all parameters are valid/);
  });

  it("404 hints at resource not found", async () => {
    mockFetch(404, "not found");
    const api = new ArcadiaApiClient();
    await expect(api.getAccountOverview(8453, "0x123")).rejects.toThrow(/resource was not found/);
  });

  it("422 hints at invalid input", async () => {
    mockFetch(422, "unprocessable");
    const api = new ArcadiaApiClient();
    await expect(api.getAssets(8453)).rejects.toThrow(/rejected the request parameters/);
  });

  it("500 hints at common causes", async () => {
    mockFetch(500, "internal server error");
    const api = new ArcadiaApiClient();
    await expect(api.getAccountOverview(8453, "0x123")).rejects.toThrow(
      /spot account used where margin required/,
    );
  });

  it("502 hints at temporary unavailability", async () => {
    mockFetch(502, "bad gateway");
    const api = new ArcadiaApiClient();
    await expect(api.getAssets(8453)).rejects.toThrow(/temporarily unavailable/);
  });

  it("503 hints at temporary unavailability", async () => {
    mockFetch(503, "service unavailable");
    const api = new ArcadiaApiClient();
    await expect(api.getAssets(8453)).rejects.toThrow(/temporarily unavailable/);
  });

  it("includes the API path in error message", async () => {
    mockFetch(500, "error");
    const api = new ArcadiaApiClient();
    await expect(api.getAccountOverview(8453, "0x123")).rejects.toThrow(/\/accounts\/overview/);
  });

  it("truncates long error bodies to 500 chars", async () => {
    expect.assertions(2);
    mockFetch(500, "x".repeat(1000));
    const api = new ArcadiaApiClient();
    try {
      await api.getAssets(8453);
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain("...");
      expect(msg.length).toBeLessThan(850);
    }
  });

  it("POST errors use same handling", async () => {
    mockFetch(500, "calldata error");
    const api = new ArcadiaApiClient();
    await expect(
      api.getBundleCalldata({
        buy: [],
        sell: [],
        deposits: { addresses: [], ids: [], amounts: [], decimals: [] },
        withdraws: { addresses: [], ids: [], amounts: [], decimals: [] },
        wallet_address: "0x",
        account_address: "0x",
        numeraire: "0x",
        numeraire_decimals: 18,
        debt: { take: false, leverage: 0, repay: 0, creditor: "0x" },
        chain_id: 8453,
        version: 3,
        action_type: "test",
        slippage: 100,
      }),
    ).rejects.toThrow(/spot account used where margin required/);
  });

  it("carries the status and the parsed JSON body", async () => {
    expect.assertions(3);
    mockFetch(
      422,
      JSON.stringify({
        name: "Incomplete Request",
        message: "choice must be <position_manager>:<position_id>:<pool>",
      }),
    );
    const api = new ArcadiaApiClient();
    try {
      await api.getAeroUpgradePlan({ chain_id: 8453, account_address: "0x1" });
    } catch (err) {
      expect(err).toBeInstanceOf(ArcadiaApiError);
      expect((err as ArcadiaApiError).status).toBe(422);
      expect((err as ArcadiaApiError).body).toEqual({
        name: "Incomplete Request",
        message: "choice must be <position_manager>:<position_id>:<pool>",
      });
    }
  });
});

describe("ArcadiaApiClient Aero upgrade", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("joins the pool picks into one choices param and drops unset params", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = new ArcadiaApiClient("https://api.test");
    await api.getAeroUpgradePlan({
      chain_id: 8453,
      account_address: "0xacc",
      choices: ["0xa:1:0xp1", "0xb:2:0xp2"],
    });
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/v1/api/bundles/aero_upgrade");
    expect(url.searchParams.get("choices")).toBe("0xa:1:0xp1,0xb:2:0xp2");
    expect(url.searchParams.has("slippage")).toBe(false);

    await api.getAeroUpgradePlan({ chain_id: 8453, account_address: "0xacc", choices: [] });
    const bare = new URL((fetchMock.mock.calls[1] as unknown as [string])[0]);
    expect(bare.searchParams.has("choices")).toBe(false);
  });

  it("gives the batch 20 seconds per account, never less than the default timeout", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const api = new ArcadiaApiClient("https://api.test");
    await api.postAeroUpgradeBatch({ chain_id: 8453, accounts: ["0xa"] });
    await api.postAeroUpgradeBatch({ chain_id: 8453, accounts: ["0xa", "0xb", "0xc", "0xd"] });
    expect(timeout.mock.calls.map((c) => c[0])).toEqual([30_000, 80_000]);
    timeout.mockRestore();
  });

  it("asks for one owner or one account and posts the batch as JSON", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const api = new ArcadiaApiClient("https://api.test");
    await api.getAeroUpgradeCandidates({ chain_id: 10, owner_address: "0xowner" });
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/v1/api/bundles/aero_migration_candidates");
    expect(url.searchParams.get("owner_address")).toBe("0xowner");
    expect(url.searchParams.has("account_address")).toBe(false);

    await api.postAeroUpgradeBatch({ chain_id: 8453, accounts: ["0xa", "0xb"], slippage: 500 });
    const [batchUrl, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(new URL(batchUrl).pathname).toBe("/v1/api/bundles/aero_upgrade/batch");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      chain_id: 8453,
      accounts: ["0xa", "0xb"],
      slippage: 500,
    });
  });
});
