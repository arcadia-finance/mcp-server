import { describe, it, expect, beforeAll } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ArcadiaApiClient } from "../clients/api.js";
import { getChainConfigs } from "../config/chains.js";
import { registerAllTools } from "./index.js";
import { discoverTestAccounts, type TestAccount } from "./test-fixtures.js";

/**
 * End-to-end QA harness: drives every registered tool through the *real* MCP SDK
 * (server + client linked via InMemoryTransport). Unlike the mock-based unit
 * tests, this exercises `validateToolOutput`, which is where the `_zod`
 * regression (bare `z.record(...)` outputSchema) surfaced.
 *
 * Hits live Arcadia APIs. Not for CI — run with:
 *   npx vitest run src/tools/qa-all-tools.integration.test.ts
 */

const CHAIN_ID = 8453;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const CBBTC_POOL = "0xa37E9b4369dc20940009030BfbC2088F09645e3B";
const CBBTC_TRANCHE = "0x9c63A4c499B323a25D389Da759c2ac1e385eEc92";

interface Fixture {
  /** Arguments passed to client.callTool. Can depend on discovered state. */
  args?: (ctx: Ctx) => Record<string, unknown>;
  /**
   * If true, non-error response is expected (exercises validateToolOutput).
   * If false, isError:true is acceptable (API requires state we don't have).
   */
  successExpected?: boolean;
  /** Skip with reason. */
  skip?: string;
}

interface Ctx {
  account: TestAccount;
  strategyId: number;
}

const fixtures: Record<string, Fixture> = {
  // ── Reads ────────────────────────────────────────────────────────
  "read.pool.list": { args: () => ({ chain_id: CHAIN_ID }), successExpected: true },
  "read.pool.info": {
    args: () => ({ pool_address: CBBTC_POOL, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.asset.list": { args: () => ({ chain_id: CHAIN_ID }), successExpected: true },
  "read.asset.prices": {
    args: () => ({ asset_addresses: `${USDC},${WETH}`, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.strategy.list": {
    args: () => ({ featured_only: true, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.strategy.info": {
    args: (c) => ({ strategy_id: c.strategyId, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.strategy.recommendation": {
    args: (c) => ({ account_address: c.account.accountAddress, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.point_leaderboard": { args: () => ({}), successExpected: true },
  "read.wallet.points": {
    args: (c) => ({ wallet_address: c.account.owner }),
    successExpected: true,
  },
  "read.wallet.balances": {
    args: (c) => ({
      wallet_address: c.account.owner,
      token_addresses: [USDC, WETH],
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "read.wallet.allowances": {
    args: (c) => ({
      owner_address: c.account.owner,
      spender_address: c.account.accountAddress,
      token_addresses: [USDC],
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "read.wallet.accounts": {
    args: (c) => ({ wallet_address: c.account.owner, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.account.info": {
    args: (c) => ({ account_address: c.account.accountAddress, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.account.history": {
    args: (c) => ({ account_address: c.account.accountAddress, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.account.pnl": {
    args: (c) => ({ account_address: c.account.accountAddress, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "read.asset_manager.intents": { args: () => ({}), successExpected: true },
  "read.guides": { args: () => ({ topic: "overview" }), successExpected: true },

  // ── Writes (unsigned tx builders) ────────────────────────────────
  "write.wallet.approve": {
    args: (c) => ({
      token_address: USDC,
      spender_address: c.account.accountAddress,
      amount: "1000000",
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "write.account.create": {
    args: (c) => ({
      salt: 1,
      wallet_address: c.account.owner,
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "write.account.deposit": {
    args: (c) => ({
      account_address: c.account.accountAddress,
      asset_addresses: [USDC],
      asset_amounts: ["1000000"],
      chain_id: CHAIN_ID,
    }),
    // Does an on-chain allowance read via public RPC; flaky under load. Accept either.
    successExpected: false,
  },
  "write.account.withdraw": {
    args: (c) => ({
      account_address: c.account.accountAddress,
      asset_addresses: [USDC],
      asset_amounts: ["1000000"],
      chain_id: CHAIN_ID,
    }),
    // Withdraw requires on-chain asset presence — accept failure.
    successExpected: false,
  },
  "write.account.borrow": {
    args: (c) => ({
      account_address: c.account.accountAddress,
      amount: "1000000",
      to_address: c.account.owner,
      chain_id: CHAIN_ID,
    }),
    // Borrow requires margin account with creditor — accept backend rejection.
    successExpected: false,
  },
  "write.account.repay": {
    args: (c) => ({
      account_address: c.account.accountAddress,
      amount: "1000000",
      chain_id: CHAIN_ID,
    }),
    successExpected: false,
  },
  "write.account.add_liquidity": {
    args: (c) => ({
      account_address: c.account.accountAddress,
      strategy_id: c.strategyId,
      numeraire: USDC,
      deposits: [{ asset: USDC, amount: "1000000", decimals: 6 }],
      chain_id: CHAIN_ID,
    }),
    successExpected: false,
  },
  // Batched writes: driven with a discovered LP position so BatchedTransactionOutput
  // is exercised end-to-end. `stake` with action "claim" is the most forgiving
  // because it builds claim calldata even when pending yield is zero.
  "write.account.stake": {
    args: (c) => {
      const lp = c.account.lpPositions[0];
      if (!lp) throw new Error("fixture requires discovered account with LP position");
      return {
        account_address: c.account.accountAddress,
        action: "claim",
        asset_address: lp.address,
        asset_id: lp.id,
        chain_id: CHAIN_ID,
      };
    },
    successExpected: true,
  },
  "write.account.remove_liquidity": {
    args: (c) => {
      const lp = c.account.lpPositions[0];
      if (!lp) throw new Error("fixture requires discovered account with LP position");
      return {
        account_address: c.account.accountAddress,
        asset_address: lp.address,
        asset_id: lp.id,
        adjustment: "1",
        chain_id: CHAIN_ID,
      };
    },
    // Backend may reject adjustment=1 as below minimum; accept either outcome.
    successExpected: false,
  },
  "write.account.swap": {
    args: (c) => ({
      account_address: c.account.accountAddress,
      asset_from: USDC,
      asset_to: WETH,
      amount_in: "1000000",
      chain_id: CHAIN_ID,
    }),
    // Needs the account to hold `asset_from`; almost certainly errors on a random account.
    successExpected: false,
  },
  "write.account.deleverage": {
    args: (c) => ({
      account_address: c.account.accountAddress,
      amount_in: "1000000",
      asset_from: USDC,
      numeraire: USDC,
      creditor: c.account.creditor || CBBTC_POOL,
      chain_id: CHAIN_ID,
    }),
    // Needs debt + collateral; expect backend rejection on most discovered accounts.
    successExpected: false,
  },
  "write.account.close": {
    args: (c) => {
      const lp = c.account.lpPositions[0];
      if (!lp) throw new Error("fixture requires discovered account with LP position");
      return {
        account_address: c.account.accountAddress,
        assets: [{ asset_address: lp.address, asset_id: lp.id, amount: "1", decimals: 1 }],
        close_lp_only: true,
        chain_id: CHAIN_ID,
      };
    },
    // Needs on-chain LP position ownership; backend rejects on read-only discovered accounts.
    successExpected: false,
  },
  "write.pool.deposit": {
    args: (c) => ({
      tranche_address: CBBTC_TRANCHE,
      assets: "1000000",
      receiver: c.account.owner,
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "write.pool.redeem": {
    args: (c) => ({
      tranche_address: CBBTC_TRANCHE,
      shares: "1",
      receiver: c.account.owner,
      owner: c.account.owner,
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "write.account.set_asset_managers": {
    args: (c) => ({
      account_address: c.account.accountAddress,
      asset_managers: ["0x0000000000000000000000000000000000000001"],
      statuses: [true],
      datas: ["0x"],
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  // Asset-manager encoders: drive the `enabled: false` (disabledIntent) branch
  // so we exercise IntentOutput validation without needing live position state.
  "write.asset_manager.rebalancer": {
    args: () => ({ enabled: false, dex_protocol: "slipstream", chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "write.asset_manager.compounder": {
    args: () => ({ enabled: false, dex_protocol: "slipstream", chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "write.asset_manager.compounder_staked": {
    args: () => ({
      enabled: false,
      dex_protocol: "slipstream",
      sell_tokens: [WETH],
      buy_token: USDC,
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "write.asset_manager.yield_claimer": {
    args: (c) => ({
      enabled: false,
      dex_protocol: "slipstream",
      fee_recipient: c.account.owner,
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "write.asset_manager.yield_claimer_cowswap": {
    args: (c) => ({
      enabled: false,
      dex_protocol: "slipstream",
      fee_recipient: c.account.owner,
      sell_tokens: [WETH],
      buy_token: USDC,
      chain_id: CHAIN_ID,
    }),
    successExpected: true,
  },
  "write.asset_manager.cow_swapper": {
    args: () => ({ enabled: false, chain_id: CHAIN_ID }),
    successExpected: true,
  },
  "write.asset_manager.merkl_operator": {
    args: (c) => ({ enabled: false, reward_recipient: c.account.owner, chain_id: CHAIN_ID }),
    successExpected: true,
  },

  // ── Dev ──────────────────────────────────────────────────────────
  "dev.send": { args: () => ({ to: WETH, data: "0x" }), successExpected: false },
};

describe("QA: every tool via real MCP SDK", { timeout: 60_000 }, () => {
  let client: Client;
  let server: McpServer;
  let registeredNames: Set<string>;
  let ctx: Ctx;

  beforeAll(async () => {
    const api = new ArcadiaApiClient();
    const chains = getChainConfigs();
    server = new McpServer({ name: "qa", version: "0.0.0" });
    registerAllTools(server, api, chains);

    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "qa-client", version: "0.0.0" });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);

    const listed = await client.listTools();
    registeredNames = new Set(listed.tools.map((t) => t.name));

    const accounts = await discoverTestAccounts(api);
    if (accounts.length === 0) throw new Error("No accounts discovered");
    ctx = { account: accounts[0], strategyId: 45 };
  }, 60_000);

  it("fixture map covers every registered tool", () => {
    const missing = [...registeredNames].filter((n) => !(n in fixtures));
    expect(missing).toEqual([]);
    const stale = Object.keys(fixtures).filter((n) => !registeredNames.has(n));
    expect(stale).toEqual([]);
  });

  for (const [name, fix] of Object.entries(fixtures)) {
    if (fix.skip) {
      it.skip(`${name} — ${fix.skip}`, () => {});
      continue;
    }
    it(name, async () => {
      const resp = await client.callTool({ name, arguments: fix.args!(ctx) });
      const text = (resp.content as Array<{ text?: string }> | undefined)?.[0]?.text ?? "";
      // Regression guard: the `_zod` crash surfaces as a bare error string.
      expect(text).not.toMatch(/_zod/);
      if (fix.successExpected) {
        expect(resp.isError ?? false, `${name} errored: ${text}`).toBe(false);
        expect(resp.structuredContent, `${name} missing structuredContent`).toBeDefined();
      }
    });
  }

  // Regression test for tenderly_sim_status boolean/string mismatch: a swap on
  // an account that definitely holds no WETH must produce the explicit
  // "simulation FAILED — do NOT broadcast" guard, not a passthrough success or
  // an MCP output-validation error.
  it("write.account.swap: sim-failure surfaces the do-not-broadcast guard", async () => {
    const resp = await client.callTool({
      name: "write.account.swap",
      arguments: {
        account_address: ctx.account.accountAddress,
        asset_from: WETH,
        asset_to: USDC,
        amount_in: "1000000000000000000000", // 1000 WETH, no account holds this
        chain_id: CHAIN_ID,
      },
    });
    const text = (resp.content as Array<{ text?: string }> | undefined)?.[0]?.text ?? "";
    expect(text).not.toMatch(/_zod/);
    expect(resp.isError).toBe(true);
    expect(text).toContain("simulation FAILED");
  });
});
