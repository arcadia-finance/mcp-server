import { describe, it, expect, vi } from "vitest";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_ADDRESS,
} from "../../../test-utils.js";
import { ArcadiaApiClient } from "../../../clients/api.js";
import { registerAddLiquidityTool } from "./add-liquidity.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const CREDITOR = "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2";
const BRK = "0xb20000000000000000000024170488e788CBbCb4";
const POOL = "0x1111111111111111111111111111111111111111";

const OK_CHECK = {
  pool: POOL,
  token0: WETH,
  token1: USDC,
  status: "ok",
  deviation_bps: 12,
  unpriced_token: null,
  unpriced_token_name: null,
  implied_usd_price: null,
  swap_spend_raw: null,
  swap_spend_usd: null,
};

const OFF_MARKET_CHECK = { ...OK_CHECK, status: "off_market", deviation_bps: -1870 };

const UNPRICED_CHECK = {
  ...OK_CHECK,
  token0: USDC,
  token1: BRK,
  status: "unpriced",
  deviation_bps: null,
  unpriced_token: BRK,
  unpriced_token_name: "BRK.Bc",
  implied_usd_price: 0.42,
  swap_spend_raw: "500000000",
  swap_spend_usd: 500,
};

function bundle(overrides?: Record<string, unknown>) {
  return {
    calldata: "0xabcdef1234567890",
    fx_call_to: TEST_ADDRESS,
    fx_call: "flashAction",
    tenderly_sim_status: true,
    tenderly_sim_url: "https://dashboard.tenderly.co/sim/123",
    expected_value_change: -1500,
    ...overrides,
  };
}

function mockApi(bundleResult: Record<string, unknown> = bundle()) {
  return {
    getAccountOverview: vi.fn(async () => ({
      owner: TEST_ADDRESS,
      creditor: CREDITOR,
      assets: [],
    })),
    getAccounts: vi.fn(async () => ({
      accounts: [{ account_address: TEST_ACCOUNT, creation_version: 3, numeraire: USDC }],
    })),
    getAssets: vi.fn(async () => [
      { address: USDC, decimals: 6 },
      { address: WETH, decimals: 18 },
    ]),
    getStrategies: vi.fn(async () => [
      { strategy_id: 7, asset_address: POOL, asset_decimals: 18, underlyings: [] },
    ]),
    getBundleCalldata: vi.fn(async () => bundleResult),
  };
}

function setup(bundleResult?: Record<string, unknown>) {
  const mock = createMockServer();
  const api = mockApi(bundleResult);
  registerAddLiquidityTool(mock.server, api as never, createMockChains());
  return { handler: mock.getHandler("write_account_add_liquidity"), api };
}

const baseArgs = {
  account_address: TEST_ACCOUNT,
  wallet_address: TEST_ADDRESS,
  positions: [{ strategy_id: 7 }],
  deposits: [{ asset: USDC, amount: "1000000000", decimals: 6 }],
  use_account_assets: false,
  leverage: 0,
  slippage: 100,
  chain_id: 8453,
};

describe("write_account_add_liquidity price checks", () => {
  it("sends price_checks_supported in the request", async () => {
    const { handler, api } = setup();
    await handler(baseArgs);
    expect(api.getBundleCalldata.mock.calls[0][0].price_checks_supported).toBe(true);
  });

  it("returns the transaction when all checks are ok without acknowledgement", async () => {
    const { handler } = setup(bundle({ price_checks: [OK_CHECK] }));
    const result = await handler(baseArgs);
    expect(result.isError).toBeUndefined();
    expect(parseToolResponse(result).transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
  });

  it("returns the transaction when price_checks is absent", async () => {
    const { handler } = setup();
    const result = await handler(baseArgs);
    expect(result.isError).toBeUndefined();
    expect(parseToolResponse(result).transaction).toBeDefined();
  });

  it("returns warnings and no transaction for an off_market pool without acknowledgement", async () => {
    const { handler } = setup(bundle({ price_checks: [OFF_MARKET_CHECK] }));
    const result = await handler(baseArgs);
    const text = result.content[0].text;
    expect(result.isError).toBe(true);
    expect(text).toContain("18.7%");
    expect(text).toContain("accept_price_risk");
    expect(text).not.toContain("0xabcdef1234567890");
    expect(result.structuredContent).toBeUndefined();
  });

  it("returns warnings with the implied price and swap spend for an unpriced pool", async () => {
    const { handler } = setup(
      bundle({
        price_checks: [UNPRICED_CHECK],
        expected_change_status: false,
        expected_value_change: null,
        total_value_in: null,
        total_value_out: null,
      }),
    );
    const result = await handler(baseArgs);
    const text = result.content[0].text;
    expect(result.isError).toBe(true);
    expect(text).toContain("no price information for BRK.Bc");
    expect(text).not.toContain(`no price information for ${BRK}`);
    expect(text).toContain("implies a price of 0.42 USD");
    expect(text).toContain("swaps about 500 USD");
    expect(text).not.toContain("0xabcdef1234567890");
  });

  it("prints a huge implied price in full, without exponent notation", async () => {
    const { handler } = setup(
      bundle({ price_checks: [{ ...UNPRICED_CHECK, implied_usd_price: 1.7e29 }] }),
    );
    const text = (await handler(baseArgs)).content[0].text;
    expect(text).toContain("implies a price of 170,000,000,000,000,000,000,000,000,000 USD");
    expect(text).not.toMatch(/e\+/);
  });

  it("treats an unpriced entry without unpriced_token_name as malformed", async () => {
    const { handler } = setup(
      bundle({ price_checks: [{ ...UNPRICED_CHECK, unpriced_token_name: null }] }),
    );
    const result = await handler(baseArgs);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Malformed price check");
  });

  it("returns the transaction with price_checks when accept_price_risk is true", async () => {
    const { handler } = setup(bundle({ price_checks: [OFF_MARKET_CHECK] }));
    const result = await handler({ ...baseArgs, accept_price_risk: true });
    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(data.price_checks).toEqual([OFF_MARKET_CHECK]);
  });

  it("does not present a null value change as a number for an unpriced bundle", async () => {
    const { handler } = setup(
      bundle({
        price_checks: [UNPRICED_CHECK],
        expected_change_status: false,
        expected_value_change: null,
        total_value_in: null,
        total_value_out: null,
      }),
    );
    const result = await handler({ ...baseArgs, accept_price_risk: true });
    const data = parseToolResponse(result);
    expect(data.transaction).toBeDefined();
    expect(data.expected_value_change).toBeUndefined();
    expect(data.expected_value_change_unavailable).toContain("No price");
  });

  it("returns warnings plus the failure when the simulation failed, even when acknowledged", async () => {
    const failed = bundle({
      price_checks: [OFF_MARKET_CHECK],
      tenderly_sim_status: false,
      tenderly_sim_error: "execution reverted",
    });
    for (const accept of [undefined, true]) {
      const { handler } = setup(failed);
      const result = await handler({ ...baseArgs, accept_price_risk: accept });
      const text = result.content[0].text;
      expect(result.isError).toBe(true);
      expect(text).toContain("simulation FAILED");
      expect(text).toContain("execution reverted");
      expect(text).toContain("18.7%");
      expect(text).not.toContain("0xabcdef1234567890");
    }
  });

  it("reads price_checks before the simulation failure branch when ok", async () => {
    const { handler } = setup(
      bundle({ price_checks: [OK_CHECK], tenderly_sim_status: false, tenderly_sim_error: "boom" }),
    );
    const result = await handler(baseArgs);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("simulation FAILED");
    expect(result.content[0].text).not.toContain("accept_price_risk");
  });

  function setupBackendError(status: number, body: string) {
    const ctx = setup();
    const client = new ArcadiaApiClient("https://api.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status })),
    );
    ctx.api.getBundleCalldata.mockImplementation((req) => client.getBundleCalldata(req as never));
    return ctx;
  }

  it("returns a backend refusal message alone and the acknowledgement does not bypass it", async () => {
    const { handler } = setupBackendError(
      400,
      JSON.stringify({
        name: "Transaction Would Revert",
        message: "This pool has no usable liquidity.",
      }),
    );
    try {
      const result = await handler({ ...baseArgs, accept_price_risk: true });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error: This pool has no usable liquidity.");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the full API error text for a 400 without a message", async () => {
    const { handler } = setupBackendError(400, JSON.stringify({ detail: "bad input" }));
    try {
      const text = (await handler(baseArgs)).content[0].text;
      expect(text).toContain("Arcadia API error (400 on /bundles/calldata)");
      expect(text).toContain("Check that all parameters are valid");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the full API error text for a 500", async () => {
    const { handler } = setupBackendError(
      500,
      JSON.stringify({ name: "Internal", message: "boom" }),
    );
    try {
      const text = (await handler(baseArgs)).content[0].text;
      expect(text).toContain("Arcadia API error (500 on /bundles/calldata)");
      expect(text).toContain("Internal backend error");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("treats an off_market entry without deviation_bps as malformed", async () => {
    const { handler } = setup(
      bundle({ price_checks: [{ ...OFF_MARKET_CHECK, deviation_bps: null }] }),
    );
    for (const accept of [undefined, true]) {
      const result = await handler({ ...baseArgs, accept_price_risk: accept });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Malformed price check");
      expect(result.content[0].text).not.toContain("0xabcdef1234567890");
    }
  });

  it("omits the unavailable note when expected_change_status is false without an unpriced entry", async () => {
    const { handler } = setup(
      bundle({
        price_checks: [OK_CHECK],
        expected_change_status: false,
        expected_value_change: null,
      }),
    );
    const data = parseToolResponse(await handler(baseArgs));
    expect(data.transaction).toBeDefined();
    expect(data.expected_value_change_unavailable).toBeUndefined();
  });
});
