import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ADDRESS,
  TEST_ACCOUNT,
} from "../../../test-utils.js";
import { registerPoolRedeemTool } from "./redeem.js";
import { trancheAbi } from "../../../abis/index.js";

function setup() {
  const mock = createMockServer();
  registerPoolRedeemTool(mock.server, createMockChains());
  return mock.getHandler("write.pool.redeem");
}

describe("write.pool.redeem", () => {
  it("encodes tranche.redeem(shares, receiver, owner)", async () => {
    const handler = setup();
    const result = await handler({
      tranche_address: TEST_ADDRESS,
      shares: "500000",
      receiver: TEST_ACCOUNT,
      owner: TEST_ACCOUNT,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to.toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
    expect(transaction.value).toBe("0");
    expect(transaction.chainId).toBe(8453);

    const decoded = decodeFunctionData({
      abi: trancheAbi,
      data: transaction.data,
    });
    expect(decoded.functionName).toBe("redeem");
    expect(decoded.args[0]).toBe(500000n);
    expect((decoded.args[1] as string).toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
    expect((decoded.args[2] as string).toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });

  it("appends ERC-8021 attribution suffix to calldata", async () => {
    const handler = setup();
    const result = await handler({
      tranche_address: TEST_ADDRESS,
      shares: "1",
      receiver: TEST_ACCOUNT,
      owner: TEST_ACCOUNT,
      chain_id: 8453,
    });
    const { transaction } = parseToolResponse(result);
    expect(transaction.data.endsWith("80218021802180218021802180218021")).toBe(true);
  });

  it("rejects an invalid tranche_address", async () => {
    const handler = setup();
    const result = await handler({
      tranche_address: "not-an-address",
      shares: "1",
      receiver: TEST_ACCOUNT,
      owner: TEST_ACCOUNT,
      chain_id: 8453,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects an invalid owner", async () => {
    const handler = setup();
    const result = await handler({
      tranche_address: TEST_ADDRESS,
      shares: "1",
      receiver: TEST_ACCOUNT,
      owner: "bogus",
      chain_id: 8453,
    });
    expect(result.isError).toBe(true);
  });
});
