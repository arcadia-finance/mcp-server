import { describe, it, expect, vi } from "vitest";
import { decodeFunctionData } from "viem";
import { getAccountAbi } from "../../abis/index.js";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_ADDRESS,
} from "../../test-utils.js";
import { registerWithdrawTool } from "./withdraw.js";

vi.mock("../../clients/chain.js", () => ({
  getPublicClient: vi.fn(() => ({
    readContract: vi.fn(async () => 3n),
  })),
}));

function setup() {
  const mock = createMockServer();
  registerWithdrawTool(mock.server, createMockChains());
  return mock.getHandler("write.withdraw");
}

describe("write.withdraw", () => {
  describe("V4 account (explicit)", () => {
    it("encodes withdraw with assetTypes param", async () => {
      const handler = setup();
      const result = await handler({
        account_address: TEST_ACCOUNT,
        asset_addresses: [TEST_ADDRESS],
        asset_amounts: ["500000"],
        account_version: 4,
        chain_id: 8453,
      });

      const { transaction } = parseToolResponse(result);
      const decoded = decodeFunctionData({ abi: getAccountAbi(4), data: transaction.data });

      expect(decoded.functionName).toBe("withdraw");
      expect(decoded.args[0].map((a: string) => a.toLowerCase())).toEqual([
        TEST_ADDRESS.toLowerCase(),
      ]);
      expect(decoded.args[1]).toEqual([0n]);
      expect(decoded.args[2]).toEqual([500000n]);
      expect(decoded.args[3]).toEqual([1n]); // ERC20 = 1
    });

    it("encodes multiple assets with assetTypes for each", async () => {
      const handler = setup();
      const result = await handler({
        account_address: TEST_ACCOUNT,
        asset_addresses: [TEST_ADDRESS, TEST_ADDRESS],
        asset_amounts: ["100", "200"],
        account_version: 4,
        chain_id: 8453,
      });

      const { transaction } = parseToolResponse(result);
      const decoded = decodeFunctionData({ abi: getAccountAbi(4), data: transaction.data });

      expect(decoded.args[1]).toEqual([0n, 0n]);
      expect(decoded.args[3]).toEqual([1n, 1n]);
    });

    it("handles explicit asset IDs", async () => {
      const handler = setup();
      const result = await handler({
        account_address: TEST_ACCOUNT,
        asset_addresses: [TEST_ADDRESS, TEST_ADDRESS],
        asset_amounts: ["100", "200"],
        asset_ids: [5, 10],
        account_version: 4,
        chain_id: 8453,
      });

      const { transaction } = parseToolResponse(result);
      const decoded = decodeFunctionData({ abi: getAccountAbi(4), data: transaction.data });

      expect(decoded.args[1]).toEqual([5n, 10n]);
    });
  });

  describe("V3 account (explicit)", () => {
    it("encodes withdraw without assetTypes param", async () => {
      const handler = setup();
      const result = await handler({
        account_address: TEST_ACCOUNT,
        asset_addresses: [TEST_ADDRESS],
        asset_amounts: ["500000"],
        account_version: 3,
        chain_id: 8453,
      });

      const { transaction } = parseToolResponse(result);
      const decoded = decodeFunctionData({ abi: getAccountAbi(3), data: transaction.data });

      expect(decoded.functionName).toBe("withdraw");
      expect(decoded.args[0].map((a: string) => a.toLowerCase())).toEqual([
        TEST_ADDRESS.toLowerCase(),
      ]);
      expect(decoded.args[1]).toEqual([0n]);
      expect(decoded.args[2]).toEqual([500000n]);
      expect(decoded.args).toHaveLength(3);
    });

    it("defaults asset_ids to zeros when omitted", async () => {
      const handler = setup();
      const result = await handler({
        account_address: TEST_ACCOUNT,
        asset_addresses: [TEST_ADDRESS, TEST_ADDRESS],
        asset_amounts: ["100", "200"],
        account_version: 3,
        chain_id: 8453,
      });

      const { transaction } = parseToolResponse(result);
      const decoded = decodeFunctionData({ abi: getAccountAbi(3), data: transaction.data });

      expect(decoded.args[1]).toEqual([0n, 0n]);
      expect(decoded.args).toHaveLength(3);
    });
  });

  describe("auto-detection", () => {
    it("reads ACCOUNT_VERSION on-chain when account_version omitted", async () => {
      const handler = setup();
      const result = await handler({
        account_address: TEST_ACCOUNT,
        asset_addresses: [TEST_ADDRESS],
        asset_amounts: ["500000"],
        chain_id: 8453,
      });

      // Mock returns 3n, so should encode V3 (no assetTypes)
      const { transaction } = parseToolResponse(result);
      const decoded = decodeFunctionData({ abi: getAccountAbi(3), data: transaction.data });

      expect(decoded.functionName).toBe("withdraw");
      expect(decoded.args).toHaveLength(3);
    });
  });

  it("returns tx 'to' as the account address", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [TEST_ADDRESS],
      asset_amounts: ["100"],
      account_version: 4,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to.toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });

  it("rejects max_uint256 amounts", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [TEST_ADDRESS],
      asset_amounts: ["max_uint256"],
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
  });

  it("returns error when arrays have different lengths", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [TEST_ADDRESS],
      asset_amounts: ["100", "200"],
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
  });
});
