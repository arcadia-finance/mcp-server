import { describe, it, expect } from "vitest";
import { decodeAbiParameters, decodeFunctionData } from "viem";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ACCOUNT,
} from "../../../test-utils.js";
import { registerRebalancerTool } from "./rebalancer.js";
import { registerCompounderTools } from "./compounder.js";
import { registerYieldClaimerTools } from "./yield-claimer.js";
import { registerCowSwapperTool } from "./cow-swapper.js";
import { registerMerklOperatorTool } from "./merkl-operator.js";
import { registerSetAssetManagersTool } from "./set-asset-managers.js";
import { registerAssetManagerTools } from "../../read/asset-managers.js";
import { accountAbi } from "../../../abis/index.js";

const FEE_RECIPIENT = "0x1111111111111111111111111111111111111111" as const;
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

const REBALANCER_INITIATOR = "0x163CcA8F161CBBB401a96aDf4Cbf4D74f3faD1Ed";
const COMPOUNDER_INITIATOR = "0xb0f46DB8B96e265C1D93396444Eee952086C6f3D";
const CLAIMER_INITIATOR = "0xDc9B596ce15F859673D1Be72e2Aadd41DD3aC4fE";
const MERKL_INITIATOR = "0x521541D932B15631e8a1B037f17457C801722bA0";

function setupAll() {
  const mock = createMockServer();
  const chains = createMockChains();
  registerAssetManagerTools(mock.server);
  registerRebalancerTool(mock.server, chains);
  registerCompounderTools(mock.server, chains);
  registerYieldClaimerTools(mock.server, chains);
  registerCowSwapperTool(mock.server, chains);
  registerMerklOperatorTool(mock.server, chains);
  registerSetAssetManagersTool(mock.server, chains);
  return mock;
}

describe("write.asset_managers.rebalancer", () => {
  it("encodes rebalancer with default params", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.rebalancer");
    const result = await handler({
      pool_protocol: "slipstream",
      enabled: true,
      compound_leftovers: "all",
      optimal_token0_ratio: 500000,
      trigger_lower_ratio: 0,
      trigger_upper_ratio: 0,
      min_rebalance_time: 3600,
      max_rebalance_time: 1e12,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(parsed.asset_managers).toHaveLength(1);
    expect(parsed.statuses).toEqual([true]);
    expect(parsed.datas[0]).toMatch(/^0x/);

    const [initiator] = decodeAbiParameters(
      [{ name: "initiator", type: "address" }],
      parsed.datas[0] as `0x${string}`,
    );
    expect((initiator as string).toLowerCase()).toBe(REBALANCER_INITIATOR.toLowerCase());
  });

  it("returns disabled intent with enabled=false", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.rebalancer");
    const result = await handler({
      pool_protocol: "slipstream",
      enabled: false,
      compound_leftovers: "all",
      optimal_token0_ratio: 500000,
      trigger_lower_ratio: 0,
      trigger_upper_ratio: 0,
      min_rebalance_time: 3600,
      max_rebalance_time: 1e12,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(parsed.statuses).toEqual([false]);
    expect(parsed.datas).toEqual(["0x"]);
  });

  it("returns error for slipstream_v2 on Unichain", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.rebalancer");
    const result = await handler({
      pool_protocol: "slipstream_v2",
      enabled: true,
      compound_leftovers: "all",
      optimal_token0_ratio: 500000,
      trigger_lower_ratio: 0,
      trigger_upper_ratio: 0,
      min_rebalance_time: 3600,
      max_rebalance_time: 1e12,
      chain_id: 130,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not available");
  });
});

describe("write.asset_managers.compounder", () => {
  it("encodes compounder with correct initiator", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.compounder");
    const result = await handler({
      pool_protocol: "uniV3",
      enabled: true,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(parsed.asset_managers).toHaveLength(1);
    expect(parsed.statuses).toEqual([true]);

    const [initiator] = decodeAbiParameters(
      [{ name: "initiator", type: "address" }],
      parsed.datas[0] as `0x${string}`,
    );
    expect((initiator as string).toLowerCase()).toBe(COMPOUNDER_INITIATOR.toLowerCase());
  });
});

describe("write.asset_managers.compounder_staked", () => {
  it("encodes cowswapper + compounder with 2 entries", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.compounder_staked");
    const result = await handler({
      pool_protocol: "slipstream",
      sell_tokens: [AERO],
      buy_token: USDC,
      enabled: true,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(parsed.asset_managers).toHaveLength(2);
    expect(parsed.statuses).toEqual([true, true]);
    expect(parsed.datas).toHaveLength(2);
  });

  it("returns error for cowswapper on Unichain", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.compounder_staked");
    const result = await handler({
      pool_protocol: "slipstream",
      sell_tokens: [AERO],
      buy_token: USDC,
      enabled: true,
      chain_id: 130,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not available");
  });
});

describe("write.asset_managers.yield_claimer", () => {
  it("encodes yield claimer with fee_recipient", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.yield_claimer");
    const result = await handler({
      pool_protocol: "slipstream",
      fee_recipient: FEE_RECIPIENT,
      enabled: true,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(parsed.asset_managers).toHaveLength(1);

    const [initiator, feeRecipient] = decodeAbiParameters(
      [
        { name: "initiator", type: "address" },
        { name: "feeRecipient", type: "address" },
      ],
      parsed.datas[0] as `0x${string}`,
    );
    expect((initiator as string).toLowerCase()).toBe(CLAIMER_INITIATOR.toLowerCase());
    expect((feeRecipient as string).toLowerCase()).toBe(FEE_RECIPIENT.toLowerCase());
  });
});

describe("write.asset_managers.yield_claimer_cowswap", () => {
  it("encodes cowswapper + yield claimer with 2 entries", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.yield_claimer_cowswap");
    const result = await handler({
      pool_protocol: "slipstream",
      sell_tokens: [AERO],
      buy_token: USDC,
      fee_recipient: FEE_RECIPIENT,
      enabled: true,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(parsed.asset_managers).toHaveLength(2);
    expect(parsed.statuses).toEqual([true, true]);
  });
});

describe("write.asset_managers.cow_swapper", () => {
  it("encodes direct cowswap mode", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.cow_swapper");
    const result = await handler({
      enabled: true,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(parsed.asset_managers).toHaveLength(1);
    expect(parsed.statuses).toEqual([true]);
  });

  it("returns error on Unichain", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.cow_swapper");
    const result = await handler({
      enabled: true,
      chain_id: 130,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not available");
  });
});

describe("write.asset_managers.merkl_operator", () => {
  it("encodes merkl operator with reward_recipient", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.asset_managers.merkl_operator");
    const result = await handler({
      reward_recipient: FEE_RECIPIENT,
      enabled: true,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(parsed.asset_managers).toHaveLength(1);

    const [initiator, rewardRecipient] = decodeAbiParameters(
      [
        { name: "initiator", type: "address" },
        { name: "rewardRecipient", type: "address" },
      ],
      parsed.datas[0] as `0x${string}`,
    );
    expect((initiator as string).toLowerCase()).toBe(MERKL_INITIATOR.toLowerCase());
    expect((rewardRecipient as string).toLowerCase()).toBe(FEE_RECIPIENT.toLowerCase());
  });
});

describe("write.account.set_asset_managers", () => {
  it("builds setAssetManagers tx from encoded args", async () => {
    const mock = setupAll();

    // First get encoded args from rebalancer
    const rebalancerHandler = mock.getHandler("write.asset_managers.rebalancer");
    const rebalancerResult = await rebalancerHandler({
      pool_protocol: "slipstream",
      enabled: true,
      compound_leftovers: "all",
      optimal_token0_ratio: 500000,
      trigger_lower_ratio: 0,
      trigger_upper_ratio: 0,
      min_rebalance_time: 3600,
      max_rebalance_time: 1e12,
      chain_id: 8453,
    });
    const rebalancerArgs = parseToolResponse(rebalancerResult);

    // Build tx
    const setHandler = mock.getHandler("write.account.set_asset_managers");
    const result = await setHandler({
      account_address: TEST_ACCOUNT,
      asset_managers: rebalancerArgs.asset_managers,
      statuses: rebalancerArgs.statuses,
      datas: rebalancerArgs.datas,
      chain_id: 8453,
    });

    const { transaction } = parseToolResponse(result);
    expect(transaction.to.toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
    expect(transaction.chainId).toBe(8453);

    const decoded = decodeFunctionData({ abi: accountAbi, data: transaction.data });
    expect(decoded.functionName).toBe("setAssetManagers");
    expect(decoded.args[1][0]).toBe(true);
  });

  it("returns error for mismatched array lengths", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.account.set_asset_managers");
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_managers: [FEE_RECIPIENT],
      statuses: [true, false],
      datas: ["0x"],
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Array lengths must match");
  });

  it("returns error for empty arrays", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("write.account.set_asset_managers");
    const result = await handler({
      account_address: TEST_ACCOUNT,
      asset_managers: [],
      statuses: [],
      datas: [],
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("At least one");
  });
});

describe("read.asset_managers.intents", () => {
  it("returns all 7 automations without chain filter", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("read.asset_managers.intents");
    const result = await handler({});

    const parsed = parseToolResponse(result);
    expect(parsed.automations).toHaveLength(7);
    expect(parsed.automations.map((a: { id: string }) => a.id)).toEqual([
      "rebalancer",
      "compounder",
      "compounder_staked",
      "yield_claimer",
      "yield_claimer_cowswap",
      "cow_swapper",
      "merkl_operator",
    ]);
  });

  it("filters by chain_id — Unichain excludes cowswapper intents", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("read.asset_managers.intents");
    const result = await handler({ chain_id: 130 });

    const parsed = parseToolResponse(result);
    const ids = parsed.automations.map((a: { id: string }) => a.id);
    expect(ids).not.toContain("compounder_staked");
    expect(ids).not.toContain("yield_claimer_cowswap");
    expect(ids).not.toContain("cow_swapper");
    expect(ids).toContain("rebalancer");
    expect(ids).toContain("merkl_operator");
  });

  it("each automation has required fields", async () => {
    const mock = setupAll();
    const handler = mock.getHandler("read.asset_managers.intents");
    const result = await handler({});

    const parsed = parseToolResponse(result);
    for (const a of parsed.automations) {
      expect(a).toHaveProperty("id");
      expect(a).toHaveProperty("tool");
      expect(a).toHaveProperty("description");
      expect(a).toHaveProperty("chains");
      expect(a).toHaveProperty("required_params");
    }
  });
});
