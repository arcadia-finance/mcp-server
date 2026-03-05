import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { poolAbi } from "../../abis/index.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import {
  createMockServer,
  createMockChains,
  createMockApi,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_SPOT_ACCOUNT,
  TEST_ADDRESS,
  TEST_POOL,
} from "../../test-utils.js";
import { registerBorrowTool } from "./borrow.js";

function setup() {
  const mock = createMockServer();
  const api = createMockApi();
  registerBorrowTool(mock.server, createMockChains(), api as unknown as ArcadiaApiClient);
  return mock.getHandler("build_borrow_tx");
}

describe("build_borrow_tx", () => {
  it("encodes borrow(amount, account, to, referrer) correctly", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_ACCOUNT,
      amount: "1000000000000000000",
      to: TEST_ADDRESS,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: poolAbi, data: transaction.data });

    expect(decoded.functionName).toBe("borrow");
    expect(decoded.args[0]).toBe(1000000000000000000n);
    expect(decoded.args[1].toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
    expect(decoded.args[2].toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
  });

  it("hardcodes referrer as 0x000000", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_ACCOUNT,
      amount: "100",
      to: TEST_ADDRESS,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: poolAbi, data: transaction.data });

    expect(decoded.args[3]).toBe("0x000000");
  });

  it("converts amount string to BigInt", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_ACCOUNT,
      amount: "999999999999999999999",
      to: TEST_ADDRESS,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: poolAbi, data: transaction.data });

    expect(decoded.args[0]).toBe(999999999999999999999n);
  });

  it("returns tx 'to' as the pool address", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_ACCOUNT,
      amount: "100",
      to: TEST_ADDRESS,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to).toBe(TEST_POOL);
  });

  it("rejects borrow for spot accounts (no creditor)", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_SPOT_ACCOUNT,
      amount: "100",
      to: TEST_ADDRESS,
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no creditor");
  });
});
