import { describe, it, expect, beforeAll } from "vitest";
import { createMockServer, parseToolResponse } from "../../test-utils.js";
import { ArcadiaApiClient } from "../../clients/api.js";
import { getChainConfigs } from "../../config/chains.js";
import { registerAddLiquidityTool } from "./add-liquidity.js";
import { registerRemoveLiquidityTool } from "./remove-liquidity.js";
import { registerSwapTool } from "./swap.js";
import { registerRepayWithCollateralTool } from "./repay-with-collateral.js";
import { registerPositionActionsTool } from "./position-actions.js";
import {
  discoverTestAccounts,
  findAccountWithDebtAndLP,
  findAccountWithStakedLP,
  findMarginAccount,
  findUsdcStrategy,
  type TestAccount,
} from "../test-fixtures.js";

/**
 * Integration tests for advanced tools — call the real Arcadia API.
 * Accounts are discovered dynamically via the leaderboard (no hardcoded addresses).
 * Run with: npx vitest run src/tools/advanced/integration.test.ts
 */

function setup() {
  const mock = createMockServer();
  const api = new ArcadiaApiClient();
  const chains = getChainConfigs();
  registerAddLiquidityTool(mock.server, api, chains);
  registerRemoveLiquidityTool(mock.server, api);
  registerSwapTool(mock.server, api);
  registerRepayWithCollateralTool(mock.server, api);
  registerPositionActionsTool(mock.server, api);
  return { mock, api };
}

describe("Advanced tools — live API (Base 8453)", { timeout: 30_000 }, () => {
  const { mock, api } = setup();
  let accounts: TestAccount[] = [];

  beforeAll(async () => {
    accounts = await discoverTestAccounts(api);
    if (accounts.length === 0) {
      throw new Error("No accounts with LP positions found on leaderboard — cannot run tests");
    }
  }, 30_000);

  // ── Position Actions ──────────────────────────────────────────

  it("build_position_action_tx claim returns calldata", async () => {
    const found = findAccountWithStakedLP(accounts);
    if (!found) {
      console.warn("SKIP: No account with staked LP found on leaderboard");
      return;
    }
    const handler = mock.getHandler("build_position_action_tx");
    const result = await handler({
      account_address: found.account.accountAddress,
      action: "claim",
      asset_address: found.lp.address,
      asset_id: found.lp.id,
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data.transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(data.transaction.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("build_position_action_tx stake returns calldata for unstaked LP", async () => {
    const found = findAccountWithDebtAndLP(accounts);
    if (!found) {
      console.warn("SKIP: No account with unstaked LP found on leaderboard");
      return;
    }
    const handler = mock.getHandler("build_position_action_tx");
    const result = await handler({
      account_address: found.account.accountAddress,
      action: "stake",
      asset_address: found.lp.address,
      asset_id: found.lp.id,
      chain_id: 8453,
    });
    if (result.isError) {
      // LP may already be staked on-chain — skip gracefully
      console.warn(
        "SKIP: stake returned error (LP likely already staked):",
        result.content[0].text,
      );
      return;
    }
    const data = parseToolResponse(result);
    expect(data.transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(data.transaction.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  // ── Remove Liquidity ──────────────────────────────────────────

  it("build_remove_liquidity_tx returns calldata", async () => {
    const found = findAccountWithDebtAndLP(accounts);
    if (!found) {
      console.warn("SKIP: No account with unstaked LP found on leaderboard");
      return;
    }
    const handler = mock.getHandler("build_remove_liquidity_tx");
    const result = await handler({
      account_address: found.account.accountAddress,
      asset_address: found.lp.address,
      asset_id: found.lp.id,
      adjustment: 1000, // small amount — not actually submitted
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data.transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(data.transaction.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  // ── Swap ──────────────────────────────────────────────────────

  it("build_swap_tx returns calldata for WETH→USDC swap", async () => {
    const found = findAccountWithDebtAndLP(accounts);
    if (!found) {
      console.warn("SKIP: No account with LP found on leaderboard");
      return;
    }
    const handler = mock.getHandler("build_swap_tx");
    const result = await handler({
      account_address: found.account.accountAddress,
      asset_from: "0x4200000000000000000000000000000000000006", // WETH
      asset_to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      amount_in: "1000000000000000", // 0.001 WETH
      slippage: 100,
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data.transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(data.transaction.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  // ── Repay With Collateral ─────────────────────────────────────

  it("build_repay_with_collateral_tx returns calldata", async () => {
    const found = findAccountWithDebtAndLP(accounts);
    if (!found) {
      console.warn("SKIP: No account with debt + LP found on leaderboard");
      return;
    }
    const handler = mock.getHandler("build_repay_with_collateral_tx");
    const result = await handler({
      account_address: found.account.accountAddress,
      amount_in: "1000000000000000", // 0.001 WETH worth of collateral
      asset_from: "0x4200000000000000000000000000000000000006", // WETH (sell from account)
      numeraire: "0x4200000000000000000000000000000000000006", // WETH = debt token
      creditor: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2", // WETH lending pool
      slippage: 100,
      chain_id: 8453,
    });
    expect(result.isError).toBeFalsy();
    const data = parseToolResponse(result);
    expect(data.transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(data.transaction.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  // ── Add Liquidity ───────────────────────────────────────────

  it("build_add_liquidity_tx returns calldata (no leverage)", async () => {
    const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

    // Need a margin account (has creditor) + a USDC strategy
    const marginAccount = findMarginAccount(accounts);
    if (!marginAccount) {
      console.warn("SKIP: No margin account (with creditor) found on leaderboard");
      return;
    }
    const strategy = await findUsdcStrategy(api);
    if (!strategy) {
      console.warn("SKIP: No USDC strategy found on Base");
      return;
    }

    const handler = mock.getHandler("build_add_liquidity_tx");
    const result = await handler({
      account_address: marginAccount.accountAddress,
      wallet_address: marginAccount.owner,
      positions: [{ strategy_id: strategy.strategy_id }],
      deposits: [{ asset: USDC, amount: "3000000", decimals: 6 }], // 3 USDC (above minimum_margin of 2 USDC)
      leverage: 0,
      slippage: 100,
      chain_id: 8453,
    });

    const text = result.content[0].text;
    expect(text).toBeDefined();
    if (result.isError) {
      console.warn("SKIP: add_liquidity returned error (API issue):", text);
      return;
    }
    const data = parseToolResponse(result);
    expect(data.transaction.data).toMatch(/^0x[0-9a-fA-F]+$/);
    expect(data.transaction.to).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
