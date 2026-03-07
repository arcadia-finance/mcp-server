import { describe, it, expect } from "vitest";
import { decodeFunctionData } from "viem";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_ADDRESS,
} from "../../../test-utils.js";
import { registerSetTool } from "./set.js";
import { accountAbi } from "../../../abis/index.js";

const REBALANCER_SLIPSTREAM_V2 = "0x953Ff365d0b562ceC658dc46B394E9282338d9Ea" as const;

function setup() {
  const mock = createMockServer();
  registerSetTool(mock.server, createMockChains());
  return mock.getHandler("write.asset_manager.set");
}

describe("write.asset_manager.set", () => {
  it("encodes setAssetManagers(address[], bool[], bytes[]) correctly", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: TEST_ADDRESS,
      enabled: true,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });

    expect(decoded.functionName).toBe("setAssetManagers");
    expect((decoded.args[0][0] as string).toLowerCase()).toBe(TEST_ADDRESS.toLowerCase());
    expect(decoded.args[1][0]).toBe(true);
    expect(decoded.args[2][0]).toBe("0x");
  });

  it("encodes revocation (enabled=false)", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: TEST_ADDRESS,
      enabled: false,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });

    expect(decoded.functionName).toBe("setAssetManagers");
    expect(decoded.args[1][0]).toBe(false);
  });

  it("returns tx 'to' as the account address", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: TEST_ADDRESS,
      enabled: true,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to.toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });

  it("works for known rebalancer address", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: REBALANCER_SLIPSTREAM_V2,
      enabled: true,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });

    expect(decoded.functionName).toBe("setAssetManagers");
    expect((decoded.args[0][0] as string).toLowerCase()).toBe(
      REBALANCER_SLIPSTREAM_V2.toLowerCase(),
    );
    expect(decoded.args[1][0]).toBe(true);
  });
});
