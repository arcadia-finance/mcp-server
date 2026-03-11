import { describe, it, expect, beforeAll } from "vitest";
import { createMockServer, createMockChains, parseToolResponse } from "../../test-utils.js";
import { ArcadiaApiClient } from "../../clients/api.js";
import { registerAccountTools } from "./account.js";
import { registerPoolTools } from "./pools.js";
import { registerAssetTools } from "./assets.js";
import { registerStrategyTools } from "./strategy.js";
import { registerPointsTools } from "./points.js";
import { registerWalletTools } from "./wallet.js";
import { discoverTestAccounts, type TestAccount } from "../test-fixtures.js";

/**
 * Integration tests — call the real Arcadia API.
 * Accounts are discovered dynamically via the leaderboard (no hardcoded addresses).
 * Run with: npx vitest run src/tools/read/integration.test.ts
 */

function setup() {
  const mock = createMockServer();
  const api = new ArcadiaApiClient();
  const chains = createMockChains();
  registerAccountTools(mock.server, api, chains);
  registerPoolTools(mock.server, api);
  registerAssetTools(mock.server, api);
  registerStrategyTools(mock.server, api);
  registerPointsTools(mock.server, api);
  registerWalletTools(mock.server, chains, api);
  return { mock, api };
}

describe("Read tools — live API (Base 8453)", { timeout: 30_000 }, () => {
  const { mock, api } = setup();
  let accounts: TestAccount[] = [];
  let walletAddress: string;
  let accountAddress: string;

  beforeAll(async () => {
    accounts = await discoverTestAccounts(api);
    if (accounts.length === 0) {
      throw new Error("No accounts with LP positions found on leaderboard — cannot run tests");
    }
    accountAddress = accounts[0].accountAddress;
    walletAddress = accounts[0].owner;
  }, 30_000);

  // ── Pools ───────────────────────────────────────────────────

  it("read.pool.list returns array of pools", async () => {
    const handler = mock.getHandler("read.pool.list");
    const result = await handler({ chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("pools");
    expect(Array.isArray(data.pools)).toBe(true);
    expect(data.pools.length).toBeGreaterThan(0);
    const pool = data.pools[0];
    expect(pool).toHaveProperty("address");
    expect(pool).toHaveProperty("name");
    expect(pool).toHaveProperty("apy");
  });

  it("read.pool.info returns detail + APY history", async () => {
    const handler = mock.getHandler("read.pool.info");
    const result = await handler({
      pool_address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("pool");
    expect(data).toHaveProperty("apy_history");
  });

  it("read.pool.info APY history returns array with date and pool_apy", async () => {
    const handler = mock.getHandler("read.pool.info");
    const result = await handler({
      pool_address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    if (data.apy_history && Array.isArray(data.apy_history) && data.apy_history.length > 0) {
      const entry = data.apy_history[0];
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("pool_apy");
    }
  });

  // ── Assets & Prices ─────────────────────────────────────────

  it("read.asset.list returns object with assets array", async () => {
    const handler = mock.getHandler("read.asset.list");
    const result = await handler({ chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("assets");
    expect(Array.isArray(data.assets)).toBe(true);
    expect(data.total).toBeGreaterThan(0);
    const asset = data.assets[0];
    expect(asset).toHaveProperty("address");
    expect(asset).toHaveProperty("decimals");
    expect(asset).toHaveProperty("symbol");
  });

  it("read.asset.prices with single address returns USD price", async () => {
    const handler = mock.getHandler("read.asset.prices");
    const result = await handler({
      asset_addresses: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("prices");
    const values = Object.values(data.prices);
    expect(values.length).toBe(1);
    expect(typeof values[0]).toBe("number");
    expect(values[0]).toBeGreaterThan(0);
  });

  it("read.asset.prices with multiple addresses returns price map", async () => {
    const handler = mock.getHandler("read.asset.prices");
    const result = await handler({
      asset_addresses:
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913,0x4200000000000000000000000000000000000006",
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("prices");
    const keys = Object.keys(data.prices);
    expect(keys.length).toBe(2);
    for (const key of keys) {
      expect(typeof data.prices[key]).toBe("number");
      expect(data.prices[key]).toBeGreaterThan(0);
    }
  });

  // ── Strategies ──────────────────────────────────────────────

  it("read.strategy.list returns paginated strategies object", async () => {
    const handler = mock.getHandler("read.strategy.list");
    const result = await handler({ chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("strategies");
    expect(Array.isArray(data.strategies)).toBe(true);
    expect(data.strategies.length).toBeGreaterThan(0);
    expect(data.strategies.length).toBeLessThanOrEqual(25);
    const strategy = data.strategies[0];
    expect(strategy).toHaveProperty("strategy_id");
  });

  it("read.strategy.list with featured_only returns subset with expected fields", async () => {
    const handler = mock.getHandler("read.strategy.list");
    const result = await handler({ featured_only: true, chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("strategies");
    expect(Array.isArray(data.strategies)).toBe(true);
    if (data.strategies.length > 0) {
      const featured = data.strategies[0];
      expect(featured).toHaveProperty("id");
      expect(featured).toHaveProperty("title");
      expect(featured).toHaveProperty("apy");
    }
  });

  it("read.strategy.info returns strategy detail", async () => {
    const handler = mock.getHandler("read.strategy.info");
    const result = await handler({ strategy_id: 7, chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("pool_address");
    expect(data).toHaveProperty("ranges");
  });

  // ── Points ──────────────────────────────────────────────────

  it("read.point_leaderboard returns paginated result", async () => {
    const handler = mock.getHandler("read.point_leaderboard");
    const result = await handler({ limit: 25, offset: 0 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("leaderboard");
    expect(Array.isArray(data.leaderboard)).toBe(true);
    expect(data.leaderboard.length).toBeLessThanOrEqual(25);
    if (data.leaderboard.length > 0) {
      expect(data.leaderboard[0]).toHaveProperty("user_address");
      expect(data.leaderboard[0]).toHaveProperty("total_points");
    }
  });

  it("read.wallet.points returns points data for wallet", async () => {
    const handler = mock.getHandler("read.wallet.points");
    const result = await handler({ wallet_address: walletAddress });
    const text = result.content[0].text;
    expect(text).toBeDefined();
  });

  // ── Accounts (discovered dynamically) ─────────────────────

  it("read.wallet.accounts returns accounts object for wallet", async () => {
    const handler = mock.getHandler("read.wallet.accounts");
    const result = await handler({ wallet_address: walletAddress, chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("accounts");
    expect(Array.isArray(data.accounts)).toBe(true);
    expect(data.accounts.length).toBeGreaterThan(0);
    const acct = data.accounts[0];
    expect(typeof acct).toBe("object");
  });

  it("read.account.info returns version + overview + liquidation + automation", async () => {
    const handler = mock.getHandler("read.account.info");
    const result = await handler({ account_address: accountAddress, chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("account_version");
    expect(data).toHaveProperty("overview");
    expect(data).toHaveProperty("liquidation_price");
    if (data.automation) {
      expect(data.automation).toHaveProperty("rebalancer");
      expect(data.automation).toHaveProperty("compounder");
      expect(data.automation).toHaveProperty("yield_claimer");
      expect(data.automation).toHaveProperty("merkl_operator");
      expect(data.automation).toHaveProperty("cow_swapper");
    }
  });

  it("read.account.history returns historical data", async () => {
    const handler = mock.getHandler("read.account.history");
    const result = await handler({
      account_address: accountAddress,
      days: 3,
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toBeDefined();
  });

  it("read.account.pnl returns pnl_cost_basis and yield_earned", async () => {
    const handler = mock.getHandler("read.account.pnl");
    const result = await handler({ account_address: accountAddress, chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data).toHaveProperty("pnl_cost_basis");
    expect(data).toHaveProperty("yield_earned");
  });

  it("read.strategy.recommendation with unknown account returns error gracefully", async () => {
    const handler = mock.getHandler("read.strategy.recommendation");
    const result = await handler({
      account_address: "0x0000000000000000000000000000000000000001",
      chain_id: 8453,
    });
    const text = result.content[0].text;
    expect(text).toBeDefined();
  });

  // ── Direct API tests for fixed bugs ─────────────────────────

  it("API: multi-price lookup with repeated params works", async () => {
    const result = await api.getPrices(8453, [
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "0x4200000000000000000000000000000000000006",
    ]);
    expect(typeof result).toBe("object");
    expect(Object.keys(result).length).toBe(2);
  });

  it("API: circulating supply returns number", async () => {
    const result = await api.getCirculatingSupply();
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });

  it("API: pool APY history returns array", async () => {
    const result = await api.getPoolApyHistory(
      8453,
      "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",
      7,
    );
    expect(Array.isArray(result)).toBe(true);
    if ((result as unknown[]).length > 0) {
      const entry = (result as Record<string, unknown>[])[0];
      expect(entry).toHaveProperty("date");
      expect(entry).toHaveProperty("pool_apy");
    }
  });
});
