import { describe, it, expect, vi } from "vitest";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_ADDRESS,
} from "../../test-utils.js";
import { registerClosePositionTool } from "./close-position.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const CREDITOR = "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2";

function mockApi(overrides?: Record<string, unknown>) {
  return {
    getAccountOverview: vi.fn(async () => ({
      owner: TEST_ADDRESS,
      creditor: CREDITOR,
      ...overrides,
    })),
    getAccounts: vi.fn(async () => ({
      accounts: [
        {
          account_address: TEST_ACCOUNT,
          creation_version: 3,
          numeraire: USDC,
        },
      ],
    })),
    getAssets: vi.fn(async () => [
      { address: USDC, decimals: 6 },
      { address: WETH, decimals: 18 },
    ]),
    getBundleCalldata: vi.fn(async () => ({
      calldata: "0xabcdef1234567890",
      fx_call_to: TEST_ADDRESS,
      fx_call: "flashAction",
      tenderly_sim_status: "true",
      tenderly_sim_url: "https://dashboard.tenderly.co/sim/123",
    })),
  };
}

function setup(apiOverrides?: Record<string, unknown>) {
  const mock = createMockServer();
  const api = mockApi(apiOverrides);
  registerClosePositionTool(mock.server, api as never, createMockChains());
  return { handler: mock.getHandler("build_close_position_tx"), api };
}

describe("build_close_position_tx", () => {
  it("returns calldata for full close", async () => {
    const { handler } = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1000000000000000000", decimals: 18 }],
      receive_assets: [{ asset_address: USDC, decimals: 6 }],
      close_lp_only: false,
      slippage: 100,
      chain_id: 8453,
    });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(data.transaction.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("passes correct action_type for full close", async () => {
    const { handler, api } = setup();
    await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1000", decimals: 18 }],
      receive_assets: [{ asset_address: USDC, decimals: 6 }],
      close_lp_only: false,
      chain_id: 8453,
    });

    const body = api.getBundleCalldata.mock.calls[0][0];
    expect(body.action_type).toBe("account.closing-position");
  });

  it("passes correct action_type for LP-only close", async () => {
    const { handler, api } = setup();
    await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1", decimals: 1 }],
      close_lp_only: true,
      chain_id: 8453,
    });

    const body = api.getBundleCalldata.mock.calls[0][0];
    expect(body.action_type).toBe("account.closing-lp");
  });

  it("returns error when receive_assets missing for full close", async () => {
    const { handler } = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1000", decimals: 18 }],
      close_lp_only: false,
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("receive_assets is required");
  });

  it("returns error when simulation fails", async () => {
    const mock = createMockServer();
    const api = mockApi();
    api.getBundleCalldata.mockResolvedValue({
      calldata: "0xdead",
      fx_call_to: TEST_ADDRESS,
      tenderly_sim_status: "false",
      tenderly_sim_url: "https://dashboard.tenderly.co/sim/fail",
      tenderly_sim_error: "execution reverted",
    });
    registerClosePositionTool(mock.server, api as never, createMockChains());
    const handler = mock.getHandler("build_close_position_tx");

    const result = await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1000", decimals: 18 }],
      receive_assets: [{ asset_address: USDC, decimals: 6 }],
      close_lp_only: false,
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("simulation FAILED");
  });

  it("returns error when owner cannot be determined", async () => {
    const { handler } = setup({ owner: "" });
    const result = await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1000", decimals: 18 }],
      receive_assets: [{ asset_address: USDC, decimals: 6 }],
      close_lp_only: false,
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("owner");
  });

  it("splits distribution equally for multiple receive_assets", async () => {
    const { handler, api } = setup();
    await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1000", decimals: 18 }],
      receive_assets: [
        { asset_address: USDC, decimals: 6 },
        { asset_address: WETH, decimals: 18 },
      ],
      close_lp_only: false,
      chain_id: 8453,
    });

    const body = api.getBundleCalldata.mock.calls[0][0];
    expect(body.buy).toHaveLength(2);
    expect(body.buy[0].distribution).toBe(0.5);
    expect(body.buy[1].distribution).toBe(0.5);
  });

  it("passes user-supplied distribution when provided", async () => {
    const { handler, api } = setup();
    await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1000", decimals: 18 }],
      receive_assets: [
        { asset_address: USDC, decimals: 6, distribution: 0.7 },
        { asset_address: WETH, decimals: 18, distribution: 0.3 },
      ],
      close_lp_only: false,
      chain_id: 8453,
    });

    const body = api.getBundleCalldata.mock.calls[0][0];
    expect(body.buy[0].distribution).toBe(0.7);
    expect(body.buy[1].distribution).toBe(0.3);
  });

  it("uses calldata field (not fx_call) for transaction data", async () => {
    const { handler } = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      assets: [{ asset_address: WETH, asset_id: 0, amount: "1000", decimals: 18 }],
      receive_assets: [{ asset_address: USDC, decimals: 6 }],
      close_lp_only: false,
      chain_id: 8453,
    });

    const data = parseToolResponse(result);
    // Must start with the hex calldata, NOT the function name "flashAction"
    expect(data.transaction.data).toMatch(/^0xabcdef1234567890/);
    expect(data.transaction.data).not.toBe("flashAction");
  });
});
