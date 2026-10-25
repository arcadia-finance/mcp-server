import { describe, it, expect, vi } from "vitest";
import { createMockServer } from "../../test-utils.js";
import { registerStrategyTools } from "./strategy.js";

function strategy(id: number, priceStatus?: string) {
  return {
    strategy_id: id,
    strategy_name: `strategy-${id}`,
    strategy_apy: 0.05,
    tvl: 1000,
    underlyings: [{ underlying_address: "0x1", underlying_symbol: "WETH" }],
    max_leverage: 3,
    details: priceStatus === undefined ? {} : { price_status: priceStatus },
  };
}

function handler(strategies: unknown[]) {
  const mock = createMockServer();
  const api = { getStrategies: vi.fn(async () => strategies) };
  registerStrategyTools(mock.server, api as never);
  return mock.getHandler("read_strategy_list");
}

describe("read_strategy_list price status filter", () => {
  it("drops off_market and unpriced strategies", async () => {
    const h = handler([
      strategy(1, "ok"),
      strategy(2, "off_market"),
      strategy(3, "unpriced"),
      strategy(4, "unchecked"),
      strategy(5),
    ]);
    const result = await h({ featured_only: false, limit: 25, offset: 0, chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const ids = result.structuredContent.strategies.map(
      (s: { strategy_id: number }) => s.strategy_id,
    );
    expect(ids).toEqual([1, 4, 5]);
    expect(result.structuredContent.total).toBe(3);
  });

  it("applies pagination after filtering", async () => {
    const h = handler([
      strategy(1, "off_market"),
      strategy(2, "ok"),
      strategy(3, "unpriced"),
      strategy(4, "unchecked"),
    ]);
    const result = await h({ featured_only: false, limit: 1, offset: 1, chain_id: 8453 });
    const ids = result.structuredContent.strategies.map(
      (s: { strategy_id: number }) => s.strategy_id,
    );
    expect(ids).toEqual([4]);
    expect(result.structuredContent.total).toBe(2);
  });
});
