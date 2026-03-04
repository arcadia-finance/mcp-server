import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { poolAbi } from "../../abis/index.js";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_POOL,
} from "../../test-utils.js";
import { registerRepayTool } from "./repay.js";

function setup() {
  const mock = createMockServer();
  registerRepayTool(mock.server, createMockChains());
  return mock.getHandler("build_repay_tx");
}

const MAX_UINT256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

describe("build_repay_tx", () => {
  it("encodes repay(amount, account) correctly", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_ACCOUNT,
      amount: "500000",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: poolAbi, data: transaction.data });

    expect(decoded.functionName).toBe("repay");
    expect(decoded.args[0]).toBe(500000n);
    expect(decoded.args[1].toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });

  it("handles max uint256 for full repayment", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_ACCOUNT,
      amount: MAX_UINT256,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: poolAbi, data: transaction.data });

    expect(decoded.args[0]).toBe(BigInt(MAX_UINT256));
  });

  it("returns tx 'to' as the pool address", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_ACCOUNT,
      amount: "100",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to).toBe(TEST_POOL);
  });

  it("returns value '0' and correct chainId", async () => {
    const handler = setup();
    const result = await handler({
      pool_address: TEST_POOL,
      account_address: TEST_ACCOUNT,
      amount: "100",
      chain_id: 130,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.value).toBe("0");
    expect(transaction.chainId).toBe(130);
  });
});
