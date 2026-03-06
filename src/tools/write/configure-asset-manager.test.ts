import { describe, it, expect } from "vitest";
import { decodeFunctionData, decodeAbiParameters } from "viem";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
  TEST_ADDRESS,
} from "../../test-utils.js";
import { registerConfigureAssetManagerTool } from "./configure-asset-manager.js";
import { accountAbi } from "../../abis/index.js";

const REBALANCER_SLIPSTREAM_V2 = "0x953Ff365d0b562ceC658dc46B394E9282338d9Ea" as const;
const MERKL_OPERATOR = "0x969F0251360b9Cf11c68f6Ce9587924c1B8b42C6" as const;
const FEE_RECIPIENT = "0x1111111111111111111111111111111111111111" as const;

const REBALANCER_INITIATOR = "0x163CcA8F161CBBB401a96aDf4Cbf4D74f3faD1Ed";
const COMPOUNDER_INITIATOR = "0xb0f46DB8B96e265C1D93396444Eee952086C6f3D";
const CLAIMER_INITIATOR = "0xDc9B596ce15F859673D1Be72e2Aadd41DD3aC4fE";
const MERKL_INITIATOR = "0x521541D932B15631e8a1B037f17457C801722bA0";

function setup() {
  const mock = createMockServer();
  registerConfigureAssetManagerTool(mock.server, createMockChains());
  return mock.getHandler("write.configure_asset_manager");
}

describe("write.configure_asset_manager", () => {
  it("encodes setAssetManagers for rebalancer with default params", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: REBALANCER_SLIPSTREAM_V2,
      am_type: "rebalancer",
      trigger_lower_ratio: 0,
      trigger_upper_ratio: 0,
      compound_leftovers: "all",
      min_rebalance_time: 3600,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({
      abi: accountAbi,
      data: transaction.data,
    });

    expect(decoded.functionName).toBe("setAssetManagers");
    expect((decoded.args[0][0] as string).toLowerCase()).toBe(
      REBALANCER_SLIPSTREAM_V2.toLowerCase(),
    );
    expect(decoded.args[1][0]).toBe(true);

    // Verify rebalancer initiator is encoded in callback data
    const callbackData = decoded.args[2][0] as `0x${string}`;
    const [initiator] = decodeAbiParameters([{ name: "initiator", type: "address" }], callbackData);
    expect((initiator as string).toLowerCase()).toBe(REBALANCER_INITIATOR.toLowerCase());
  });

  it("returns tx 'to' as the account address", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: REBALANCER_SLIPSTREAM_V2,
      am_type: "rebalancer",
      trigger_lower_ratio: 0,
      trigger_upper_ratio: 0,
      compound_leftovers: "all",
      min_rebalance_time: 3600,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to.toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
  });

  it("encodes compounder with correct initiator", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: TEST_ADDRESS,
      am_type: "compounder",
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({
      abi: accountAbi,
      data: transaction.data,
    });

    const callbackData = decoded.args[2][0] as `0x${string}`;
    const [initiator] = decodeAbiParameters([{ name: "initiator", type: "address" }], callbackData);
    expect((initiator as string).toLowerCase()).toBe(COMPOUNDER_INITIATOR.toLowerCase());
  });

  it("encodes yield_claimer with fee_recipient", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: TEST_ADDRESS,
      am_type: "yield_claimer",
      fee_recipient: FEE_RECIPIENT,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({
      abi: accountAbi,
      data: transaction.data,
    });

    expect(decoded.functionName).toBe("setAssetManagers");
    expect(decoded.args[1][0]).toBe(true);

    // Decode callback data: (address initiator, address feeRecipient, uint256 maxClaimFee, bytes metaData)
    const callbackData = decoded.args[2][0] as `0x${string}`;
    const [initiator, feeRecipient] = decodeAbiParameters(
      [
        { name: "initiator", type: "address" },
        { name: "feeRecipient", type: "address" },
        { name: "maxClaimFee", type: "uint256" },
        { name: "metaData_", type: "bytes" },
      ],
      callbackData,
    );
    expect((initiator as string).toLowerCase()).toBe(CLAIMER_INITIATOR.toLowerCase());
    expect((feeRecipient as string).toLowerCase()).toBe(FEE_RECIPIENT.toLowerCase());
  });

  it("encodes merkl_operator with reward_recipient", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: MERKL_OPERATOR,
      am_type: "merkl_operator",
      reward_recipient: FEE_RECIPIENT,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    const decoded = decodeFunctionData({
      abi: accountAbi,
      data: transaction.data,
    });

    expect(decoded.functionName).toBe("setAssetManagers");

    const callbackData = decoded.args[2][0] as `0x${string}`;
    const [initiator, rewardRecipient] = decodeAbiParameters(
      [
        { name: "initiator", type: "address" },
        { name: "rewardRecipient", type: "address" },
        { name: "maxClaimFee", type: "uint256" },
        { name: "metaData_", type: "bytes" },
      ],
      callbackData,
    );
    expect((initiator as string).toLowerCase()).toBe(MERKL_INITIATOR.toLowerCase());
    expect((rewardRecipient as string).toLowerCase()).toBe(FEE_RECIPIENT.toLowerCase());
  });

  it("returns error when slipstream_v2 requested on Unichain", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      am_type: "rebalancer",
      pool_protocol: "slipstream_v2",
      trigger_lower_ratio: 0,
      trigger_upper_ratio: 0,
      compound_leftovers: "all",
      min_rebalance_time: 3600,
      chain_id: 130,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not available");
    expect(result.content[0].text).toContain("Unichain");
  });

  it("returns error when yield_claimer missing fee_recipient", async () => {
    const handler = setup();
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_manager_address: TEST_ADDRESS,
      am_type: "yield_claimer",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("fee_recipient is required");
  });
});
