import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import { accountAbi } from "../../abis/index.js";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_ADDRESS,
} from "../../test-utils.js";
import { registerWithdrawTool } from "./withdraw.js";

function setup() {
  const mock = createMockServer();
  registerWithdrawTool(mock.server, createMockChains());
  return mock.getHandler("build_withdraw_tx");
}

describe("build_withdraw_tx", () => {
  it("encodes single asset withdraw correctly", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [TEST_ADDRESS],
      asset_amounts: ["500000"],
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });

    expect(decoded.functionName).toBe("withdraw");
    expect(decoded.args[0].map((a: string) => a.toLowerCase())).toEqual([
      TEST_ADDRESS.toLowerCase(),
    ]);
    expect(decoded.args[1]).toEqual([0n]);
    expect(decoded.args[2]).toEqual([500000n]);
  });

  it("defaults asset_ids to zeros when omitted", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [TEST_ADDRESS, TEST_ADDRESS],
      asset_amounts: ["100", "200"],
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });

    expect(decoded.args[1]).toEqual([0n, 0n]);
  });

  it("handles multiple assets with explicit IDs", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [TEST_ADDRESS, TEST_ADDRESS],
      asset_amounts: ["100", "200"],
      asset_ids: [5, 10],
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });

    expect(decoded.args[1]).toEqual([5n, 10n]);
  });

  it("returns tx 'to' as the account address", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [TEST_ADDRESS],
      asset_amounts: ["100"],
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to.toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });
});
