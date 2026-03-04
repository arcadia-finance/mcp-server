import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { poolAbi } from "../../abis/index.js";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_ADDRESS,
  TEST_POOL,
} from "../../test-utils.js";
import { registerBorrowTool } from "./borrow.js";

function setup() {
  const mock = createMockServer();
  registerBorrowTool(mock.server, createMockChains());
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
});
