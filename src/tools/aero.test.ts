import { describe, it, expect, vi } from "vitest";
import { ArcadiaApiError } from "../clients/api.js";
import { createMockServer, parseToolResponse, TEST_ACCOUNT, TEST_ADDRESS } from "../test-utils.js";
import { DATA_SUFFIX } from "../utils/attribution.js";
import { registerAeroMigrationTool } from "./write/account/aero-migration.js";

const SLIPSTREAM_PM = "0x827922686190790b37229fD06084350E74485b72";
const AERO_POOL = "0x00000000000000000000000000000000000a3a01";
const OLD_REBALANCER = "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F";
const NEW_REBALANCER = "0x9EA47b9db58970Ab5Ea686a5CaC3e80ec652d755";
const SUFFIX = DATA_SUFFIX.slice(2);

const managers = [
  {
    kind: "rebalancer",
    old_address: OLD_REBALANCER,
    new_address: NEW_REBALANCER,
    initiator: TEST_ADDRESS,
  },
];

function migrationCalldata(over: Record<string, unknown> = {}) {
  return {
    fx_call: "flashAction",
    fx_call_to: TEST_ACCOUNT,
    calldata: "0xabcdef",
    actionHandler: "0x0d2C7E0F6A3933c89e4Ea6569363cb2Ac1313191",
    actiondata: "0x",
    account: TEST_ACCOUNT,
    from_wallet: TEST_ADDRESS,
    tenderly_sim_url: "https://dashboard.tenderly.co/sim/1",
    tenderly_sim_status: true,
    tenderly_sim_error: null,
    gas_estimate: 1_250_000,
    price_tolerance_bps: 150,
    migration: {
      positions: [
        { asset_address: SLIPSTREAM_PM, position_id: "7", target_pool_address: AERO_POOL },
      ],
      skipped: [],
      legacy_reward_to_owner: false,
      fee_share_bps: 0,
      fee_collector: TEST_ADDRESS,
    },
    managers_to_reconnect: managers,
    ...over,
  };
}

function apiError(status: number, body: Record<string, unknown>) {
  return new ArcadiaApiError(`Arcadia API error (${status})`, status, body);
}

function setup(api: Record<string, unknown>) {
  const mock = createMockServer();
  registerAeroMigrationTool(mock.server, api as never);
  return mock.getHandler("write.account.aero_migration");
}

describe("write.account.aero_migration: migrate", () => {
  it("builds one position with the chosen pool and the ERC-8021 suffix", async () => {
    const api = { getMigrateMetadexclV1Calldata: vi.fn(async () => migrationCalldata()) };
    const result = await setup(api)({
      action: "migrate",
      account_address: TEST_ACCOUNT,
      asset_address: SLIPSTREAM_PM,
      position_id: 7,
      target_pool: AERO_POOL,
      safe: false,
      chain_id: 8453,
    });

    expect(result.isError).toBeUndefined();
    expect(api.getMigrateMetadexclV1Calldata).toHaveBeenCalledWith({
      chain_id: 8453,
      account_address: TEST_ACCOUNT,
      asset_address: SLIPSTREAM_PM,
      position_id: 7,
      target_pool: AERO_POOL,
      price_tolerance_bps: undefined,
      safe: undefined,
    });
    const data = parseToolResponse(result);
    expect(data.transaction).toEqual({
      to: TEST_ACCOUNT,
      data: `0xabcdef${SUFFIX}`,
      value: "0",
      chainId: 8453,
    });
    expect(data.tenderly_sim_status).toBe("success");
    expect(data.migration.positions).toHaveLength(1);
    expect(data.managers_to_reconnect).toEqual(managers);
    expect(data.next_steps.join(" ")).toContain("write.account.automations");
    expect(data.next_steps.join(" ")).toContain("read.account.info");
  });

  it("builds the whole account with targets and safe", async () => {
    const api = {
      getMigrateMetadexclV1AccountCalldata: vi.fn(async () =>
        migrationCalldata({ managers_to_reconnect: [] }),
      ),
    };
    const targets = [{ asset_address: SLIPSTREAM_PM, position_id: 7, target_pool: AERO_POOL }];
    const data = parseToolResponse(
      await setup(api)({
        action: "migrate",
        account_address: TEST_ACCOUNT,
        targets,
        price_tolerance_bps: 300,
        safe: true,
        chain_id: 10,
      }),
    );

    expect(api.getMigrateMetadexclV1AccountCalldata).toHaveBeenCalledWith({
      chain_id: 10,
      account_address: TEST_ACCOUNT,
      targets,
      price_tolerance_bps: 300,
      safe: true,
    });
    expect(data.next_steps.join(" ")).not.toContain("write.account.automations");
  });

  it.each([
    [{ asset_address: SLIPSTREAM_PM }, "together"],
    [
      { asset_address: SLIPSTREAM_PM, position_id: 7, targets: [] },
      "targets is for the whole account",
    ],
    [{ target_pool: AERO_POOL }, "target_pool is for one position"],
  ])("rejects inconsistent params %o", async (args, message) => {
    const api = {
      getMigrateMetadexclV1Calldata: vi.fn(),
      getMigrateMetadexclV1AccountCalldata: vi.fn(),
    };
    const result = await setup(api)({
      action: "migrate",
      account_address: TEST_ACCOUNT,
      safe: false,
      chain_id: 8453,
      ...args,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(message);
  });

  it("returns the alternatives on 409 target_choice_required", async () => {
    const alternatives = [{ pool_address: AERO_POOL, tick_spacing: 200, selectable: true }];
    const api = {
      getMigrateMetadexclV1Calldata: vi.fn(async () => {
        throw apiError(409, {
          name: "Target Pool Choice Required",
          message: "Aero has no pool at this tick spacing; pick a target pool",
          candidates: [{ asset_address: SLIPSTREAM_PM, position_id: "7", alternatives }],
        });
      }),
    };
    const result = await setup(api)({
      action: "migrate",
      account_address: TEST_ACCOUNT,
      asset_address: SLIPSTREAM_PM,
      position_id: 7,
      safe: false,
      chain_id: 8453,
    });
    expect(result.isError).toBe(true);
    const text = result.content[0].text;
    expect(text).toContain("target_choice_required");
    expect(text).toContain(AERO_POOL);
    expect(text).toContain("selectable");
  });

  it("passes a 422 code through", async () => {
    const api = {
      getMigrateMetadexclV1Calldata: vi.fn(async () => {
        throw apiError(422, {
          name: "Incomplete Request",
          message:
            "deprecated_reward_token_in_pair: a margin account cannot take a position that holds the old AERO or VELO",
        });
      }),
    };
    const result = await setup(api)({
      action: "migrate",
      account_address: TEST_ACCOUNT,
      asset_address: SLIPSTREAM_PM,
      position_id: 7,
      safe: false,
      chain_id: 8453,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("422): deprecated_reward_token_in_pair");
  });

  it("reports 503 as not live yet, not as a server failure", async () => {
    const api = {
      getMigrateMetadexclV1AccountCalldata: vi.fn(async () => {
        throw apiError(503, {
          name: "Aero Migration Not Live",
          message: "the ActionManager upgrade has not happened on chain 8453 yet",
        });
      }),
    };
    const result = await setup(api)({
      action: "migrate",
      account_address: TEST_ACCOUNT,
      safe: false,
      chain_id: 8453,
    });
    const text = result.content[0].text;
    expect(result.isError).toBe(true);
    expect(text).toContain("Aero migration is not live yet");
    expect(text).toContain("not a server failure");
    expect(text).not.toContain("temporarily unavailable");
  });

  it("keeps a generic 503 as a retryable outage, not as not live", async () => {
    const api = {
      getMigrateMetadexclV1AccountCalldata: vi.fn(async () => {
        throw new ArcadiaApiError(
          "Arcadia API error (503 on /bundles/migrate_metadexcl_v1_account): Backend is temporarily unavailable. Retry after a few seconds.",
          503,
          { message: "Upstream service error" },
        );
      }),
    };
    const result = await setup(api)({ action: "migrate", account_address: TEST_ACCOUNT });
    const text = result.content[0].text;
    expect(result.isError).toBe(true);
    expect(text).not.toContain("not live yet");
    expect(text).toContain("temporarily unavailable");
  });

  it("refuses to hand out a transaction whose simulation failed", async () => {
    const api = {
      getMigrateMetadexclV1Calldata: vi.fn(async () =>
        migrationCalldata({ tenderly_sim_status: false, tenderly_sim_error: "PriceOutOfRange" }),
      ),
    };
    const result = await setup(api)({
      action: "migrate",
      account_address: TEST_ACCOUNT,
      asset_address: SLIPSTREAM_PM,
      position_id: 7,
      safe: false,
      chain_id: 8453,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("do NOT broadcast");
    expect(result.content[0].text).toContain("PriceOutOfRange");
  });
});

describe("write.account.aero_migration: upgrade_aero", () => {
  it("builds the flashAction on Base with the suffix", async () => {
    const api = {
      getUpgradeAeroCalldata: vi.fn(async () => ({
        fx_call: "flashAction",
        fx_call_to: TEST_ACCOUNT,
        calldata: "0x1234",
        tenderly_sim_url: null,
        tenderly_sim_status: true,
        tenderly_sim_error: null,
        amount_in: "5",
        expected_amount_out: "5",
        old_token: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
        new_token: "0x3f5bF3EdAc59d650D8fDf9657a71F2f904A3a4Ee",
      })),
    };
    const data = parseToolResponse(
      await setup(api)({
        action: "upgrade_aero",
        account_address: TEST_ACCOUNT,
        amount: "5",
      }),
    );
    expect(api.getUpgradeAeroCalldata).toHaveBeenCalledWith({
      chain_id: 8453,
      account_address: TEST_ACCOUNT,
      amount: "5",
    });
    expect(data.transaction).toEqual({
      to: TEST_ACCOUNT,
      data: `0x1234${SUFFIX}`,
      value: "0",
      chainId: 8453,
    });
    expect(data.expected_amount_out).toBe("5");
  });

  it("explains a 409 upgrade-unavailable reason with its opening time", async () => {
    const api = {
      getUpgradeAeroCalldata: vi.fn(async () => {
        throw apiError(409, {
          name: "AERO Upgrade Unavailable",
          reason: "not_open",
          message: "The AERO migration opens at 1792627200.",
          opens_at: 1_792_627_200,
        });
      }),
    };
    const result = await setup(api)({
      action: "upgrade_aero",
      chain_id: 8453,
      account_address: TEST_ACCOUNT,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("upgrade unavailable (not_open)");
    expect(result.content[0].text).toContain("2026-10-22T00:00:00.000Z");
  });

  it("rejects a non-decimal amount before calling the backend", async () => {
    const api = { getUpgradeAeroCalldata: vi.fn() };
    const result = await setup(api)({
      action: "upgrade_aero",
      chain_id: 8453,
      account_address: TEST_ACCOUNT,
      amount: "1.5",
    });
    expect(result.isError).toBe(true);
    expect(api.getUpgradeAeroCalldata).not.toHaveBeenCalled();
  });
});

describe("write.account.aero_migration: upgrade_velo", () => {
  it("refuses an amount above the wallet balance, since the deposit would revert", async () => {
    const api = {
      getUpgradeVeloCalldata: vi.fn(async () => ({
        chain_id: 10,
        amount_in: "1000",
        wallet_balance: "10",
        calls: [],
      })),
    };
    const result = await setup(api)({
      action: "upgrade_velo",
      owner_address: TEST_ADDRESS,
      amount: "1000",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("less than the 1000 requested");
  });

  it("returns the approve then the payable deposit, both on Optimism", async () => {
    const api = {
      getUpgradeVeloCalldata: vi.fn(async () => ({
        chain_id: 10,
        destination_chain_id: 8453,
        owner: TEST_ADDRESS,
        recipient: TEST_ADDRESS,
        migration: "0x6daE95FE833f190640dB1176F8C8a2e50C6a66c0",
        entrypoint: "0x6daE95FE833f190640dB1176F8C8a2e50C6a66c0",
        old_token: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db",
        new_token: "0x3f5bF3EdAc59d650D8fDf9657a71F2f904A3a4Ee",
        amount_in: "1000",
        expected_amount_out: "44",
        fee_quote_wei: "100",
        fee_wei: "120",
        wallet_balance: "1000",
        allowance: "0",
        calls: [
          { to: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", data: "0xaa", value: "0" },
          { to: "0x6daE95FE833f190640dB1176F8C8a2e50C6a66c0", data: "0xbb", value: "120" },
        ],
      })),
    };
    const data = parseToolResponse(
      await setup(api)({
        action: "upgrade_velo",
        owner_address: TEST_ADDRESS,
      }),
    );

    expect(api.getUpgradeVeloCalldata).toHaveBeenCalledWith({
      chain_id: 10,
      owner_address: TEST_ADDRESS,
      amount: undefined,
    });
    expect(data.transactions.map((t: { transaction: unknown }) => t.transaction)).toEqual([
      {
        to: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db",
        data: `0xaa${SUFFIX}`,
        value: "0",
        chainId: 10,
      },
      {
        to: "0x6daE95FE833f190640dB1176F8C8a2e50C6a66c0",
        data: `0xbb${SUFFIX}`,
        value: "120",
        chainId: 10,
      },
    ]);
    expect(data.transactions[0].description).toContain("Approve");
    expect(data.transactions[1].description).toContain("Deposit");
    expect(data.destination_chain_id).toBe(8453);
  });
});

describe("write.account.aero_migration: action params", () => {
  it.each([
    [
      { action: "upgrade_aero", account_address: TEST_ACCOUNT, position_id: 7 },
      "position_id not used by action upgrade_aero",
    ],
    [
      { action: "upgrade_velo", owner_address: TEST_ADDRESS, account_address: TEST_ACCOUNT },
      "account_address not used",
    ],
    [
      { action: "migrate", account_address: TEST_ACCOUNT, amount: "5" },
      "amount not used by action migrate",
    ],
    [
      { action: "migrate", account_address: TEST_ACCOUNT, owner_address: TEST_ADDRESS },
      "owner_address not used by action migrate (only by upgrade_velo)",
    ],
    [
      { action: "upgrade_aero", account_address: TEST_ACCOUNT, safe: true },
      "safe not used by action upgrade_aero",
    ],
    [{ action: "upgrade_velo" }, "Invalid owner_address"],
  ])("rejects params of another action %o", async (args, message) => {
    const result = await setup({})(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(message);
  });
});
