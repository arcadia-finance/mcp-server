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
import { registerDepositTool } from "./deposit.js";

function setup() {
  const mock = createMockServer();
  registerDepositTool(mock.server, createMockChains());
  return mock.getHandler("build_deposit_tx");
}

describe("build_deposit_tx", () => {
  it("encodes single ERC20 deposit correctly", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [TEST_ADDRESS],
      asset_amounts: ["1000000"],
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });

    expect(decoded.functionName).toBe("deposit");
    expect(decoded.args[0].map((a: string) => a.toLowerCase())).toEqual([
      TEST_ADDRESS.toLowerCase(),
    ]);
    expect(decoded.args[1]).toEqual([0n]);
    expect(decoded.args[2]).toEqual([1000000n]);
  });

  it("encodes multiple assets with explicit IDs", async () => {
    const handler = setup();
    const addr1 = "0x4200000000000000000000000000000000000006" as const;
    const addr2 = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_addresses: [addr1, addr2],
      asset_amounts: ["1000000000000000000", "500000"],
      asset_ids: [0, 0],
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });

    expect(decoded.args[0]).toEqual([addr1, addr2]);
    expect(decoded.args[1]).toEqual([0n, 0n]);
    expect(decoded.args[2]).toEqual([1000000000000000000n, 500000n]);
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
