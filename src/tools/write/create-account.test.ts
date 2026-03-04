import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { factoryAbi } from "../../abis/index.js";
import { PROTOCOL } from "../../config/addresses.js";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_POOL,
} from "../../test-utils.js";
import { registerCreateAccountTool } from "./create-account.js";

function setup() {
  const mock = createMockServer();
  registerCreateAccountTool(mock.server, createMockChains());
  return mock.getHandler("build_create_account_tx");
}

describe("build_create_account_tx", () => {
  it("encodes createAccount(salt, version, creditor) correctly", async () => {
    const handler = setup();
    const result = await handler({
      salt: 42,
      account_version: 1,
      creditor: TEST_POOL,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: factoryAbi, data: transaction.data });

    expect(decoded.functionName).toBe("createAccount");
    expect(decoded.args[0]).toBe(42);
    expect(decoded.args[1]).toBe(1n);
    expect(decoded.args[2].toLowerCase()).toBe(TEST_POOL.toLowerCase());
  });

  it("uses zero address when creditor is omitted", async () => {
    const handler = setup();
    const result = await handler({ salt: 1, account_version: 1, chain_id: 8453 });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: factoryAbi, data: transaction.data });

    expect(decoded.args[2]).toBe("0x0000000000000000000000000000000000000000");
  });

  it("returns correct to address (factory)", async () => {
    const handler = setup();
    const result = await handler({ salt: 1, account_version: 1, chain_id: 8453 });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to).toBe(PROTOCOL.factory);
  });

  it("returns value '0' and correct chainId", async () => {
    const handler = setup();
    const result = await handler({ salt: 1, account_version: 1, chain_id: 130 });

    const { transaction } = parseToolResponse(result);
    expect(transaction.value).toBe("0");
    expect(transaction.chainId).toBe(130);
  });
});
