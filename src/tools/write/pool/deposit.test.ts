import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ADDRESS,
  TEST_ACCOUNT,
} from "../../../test-utils.js";
import { registerPoolDepositTool } from "./deposit.js";
import { trancheAbi } from "../../../abis/index.js";

function setup() {
  const mock = createMockServer();
  registerPoolDepositTool(mock.server, createMockChains());
  return mock.getHandler("write.pool.deposit");
}

describe("write.pool.deposit", () => {
  it("encodes tranche.deposit(assets, receiver)", async () => {
    const handler = setup();
    const result = await handler({
      tranche_address: TEST_ADDRESS,
      assets: "1000000",
      receiver: TEST_ACCOUNT,
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
    expect(decoded.functionName).toBe("deposit");
    expect(decoded.args[0]).toBe(1000000n);
    expect((decoded.args[1] as string).toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });

  it("appends ERC-8021 attribution suffix to calldata", async () => {
    const handler = setup();
    const result = await handler({
      tranche_address: TEST_ADDRESS,
      assets: "1",
      receiver: TEST_ACCOUNT,
      chain_id: 8453,
    });
    const { transaction } = parseToolResponse(result);
    // 16-byte marker of 0x80218021... repeating at the very end
    expect(transaction.data.endsWith("80218021802180218021802180218021")).toBe(true);
  });

  it("rejects an invalid tranche_address", async () => {
    const handler = setup();
    const result = await handler({
      tranche_address: "not-an-address",
      assets: "1",
      receiver: TEST_ACCOUNT,
      chain_id: 8453,
    });
    expect(result.isError).toBe(true);
  });

  it("rejects an invalid receiver", async () => {
    const handler = setup();
    const result = await handler({
      tranche_address: TEST_ADDRESS,
      assets: "1",
      receiver: "bogus",
      chain_id: 8453,
    });
    expect(result.isError).toBe(true);
  });
});
