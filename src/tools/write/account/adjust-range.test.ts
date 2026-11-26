import { describe, it, expect, vi } from "vitest";
import { ArcadiaApiError } from "../../../clients/api.js";
import {
  createMockServer,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_ADDRESS,
} from "../../../test-utils.js";
import { DATA_SUFFIX } from "../../../utils/attribution.js";
import { registerAdjustRangeTool } from "./adjust-range.js";

const UNIV3 = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const okCheck = {
  pool: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
  token0: WETH,
  token1: USDC,
  status: "ok",
  deviation_bps: 3,
  unpriced_token: null,
  unpriced_token_name: null,
  implied_usd_price: null,
  swap_spend_raw: null,
  swap_spend_usd: null,
};
const offMarket = { ...okCheck, status: "off_market", deviation_bps: -450 };

function response(over: Record<string, unknown> = {}) {
  return {
    chain_id: 8453,
    account_address: TEST_ACCOUNT,
    owner: TEST_ADDRESS,
    is_spot: false,
    position: {
      asset: UNIV3,
      position_id: 42,
      protocol: "univ3",
      pool: "0xd0b53D9277642d899DF5C87A3966A349A798F224",
      token0: WETH,
      token1: USDC,
      tick_spacing: 10,
      tick_lower: -200,
      tick_upper: 200,
      tick_current: 250,
      sqrt_price_x96: "1",
      amount0: "0",
      amount1: "1000",
    },
    range: { tick_lower: 0, tick_upper: 500, swap: null },
    swap: null,
    value_moved_usd: 250,
    price_impact_usd: -0.1,
    calls: [{ kind: "flash_action", to: TEST_ACCOUNT, data: "0xabcd", value: "0", gas: "2400000" }],
    price_checks: [okCheck],
    simulation: { status: true, url: "https://tdly.co/x", error: null, asset_changes: [] },
    slippage_bps: 50,
    price_tolerance_bps: 150,
    ...over,
  };
}

function tool(api: Record<string, unknown>) {
  const mock = createMockServer();
  registerAdjustRangeTool(mock.server, api as never);
  return mock.getHandler("write_account_adjust_range");
}

const args = {
  account_address: TEST_ACCOUNT,
  position_manager: UNIV3,
  position_id: 42,
  tick_lower: 0,
  tick_upper: 500,
  chain_id: 8453,
};

describe("write_account_adjust_range", () => {
  it("asks the backend for the one position at the new ticks", async () => {
    const getAdjustRange = vi.fn().mockResolvedValue(response());
    await tool({ getAdjustRange })({ ...args, slippage: 80, min_block: 7 });
    expect(getAdjustRange).toHaveBeenCalledWith({
      chain_id: 8453,
      account_address: TEST_ACCOUNT,
      position_manager: UNIV3,
      position_id: 42,
      tick_lower: 0,
      tick_upper: 500,
      slippage: 80,
      min_block: 7,
    });
  });

  it("returns the flashAction as the transaction to sign", async () => {
    const result = await tool({ getAdjustRange: vi.fn().mockResolvedValue(response()) })(args);
    const out = parseToolResponse(result);
    expect(out.transaction).toEqual({
      to: TEST_ACCOUNT,
      data: `0xabcd${DATA_SUFFIX.slice(2)}`,
      value: "0",
      chainId: 8453,
    });
    expect(out.tenderly_sim_status).toBe("success");
    expect(out.range).toEqual({ tick_lower: 0, tick_upper: 500, swap: null });
  });

  it("returns no transaction when the simulation reverts", async () => {
    const simulation = { status: false, url: "https://tdly.co/x", error: "account_unhealthy" };
    const result = await tool({
      getAdjustRange: vi.fn().mockResolvedValue(response({ calls: [], simulation })),
    })(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("do NOT broadcast");
  });

  it("flags an unsimulated transaction", async () => {
    const simulation = { status: null, url: null, error: null };
    const out = parseToolResponse(
      await tool({ getAdjustRange: vi.fn().mockResolvedValue(response({ simulation })) })(args),
    );
    expect(out.tenderly_sim_status).toBe("unavailable");
    expect(out.simulation_note).toContain("unsimulated");
  });

  it("reports the backend's refusal", async () => {
    const refusal = new ArcadiaApiError("422", 422, {
      message: "The position already has this range",
    });
    const result = await tool({ getAdjustRange: vi.fn().mockRejectedValue(refusal) })(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("already has this range");
  });

  it("refuses an invalid position manager before calling the backend", async () => {
    const getAdjustRange = vi.fn();
    const result = await tool({ getAdjustRange })({ ...args, position_manager: "0x123" });
    expect(result.isError).toBe(true);
    expect(getAdjustRange).not.toHaveBeenCalled();
  });

  it("returns the price warnings and no transaction until the user accepts them", async () => {
    const getAdjustRange = vi.fn().mockResolvedValue(response({ price_checks: [offMarket] }));
    const result = await tool({ getAdjustRange })(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("pool price is 4.5% off market");
    expect(result.content[0].text).toContain("WETH/USDC");
    expect(result.content[0].text).not.toContain(`"transaction"`);
  });

  it("returns the transaction once the user accepted the warnings", async () => {
    const getAdjustRange = vi.fn().mockResolvedValue(response({ price_checks: [offMarket] }));
    const accept = [
      { pool: offMarket.pool, status: "off_market", deviation_bps: -450, unpriced_token: null },
    ];
    const out = parseToolResponse(
      await tool({ getAdjustRange })({ ...args, accept_price_checks: accept }),
    );
    expect(out.transaction.to).toBe(TEST_ACCOUNT);
    expect(out.price_checks).toEqual([offMarket]);
  });

  it("asks again when the pool moved further off market", async () => {
    const further = { ...offMarket, deviation_bps: -900 };
    const getAdjustRange = vi.fn().mockResolvedValue(response({ price_checks: [further] }));
    const accept = [
      { pool: offMarket.pool, status: "off_market", deviation_bps: -450, unpriced_token: null },
    ];
    const result = await tool({ getAdjustRange })({ ...args, accept_price_checks: accept });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("changed since the user confirmed them");
  });
});
