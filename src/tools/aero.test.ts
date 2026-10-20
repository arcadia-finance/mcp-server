import { describe, it, expect, vi } from "vitest";
import { ArcadiaApiError } from "../clients/api.js";
import { createMockServer, parseToolResponse, TEST_ACCOUNT, TEST_ADDRESS } from "../test-utils.js";
import { DATA_SUFFIX } from "../utils/attribution.js";
import { registerAeroUpgradeReadTool } from "./read/aero-upgrade.js";
import { registerAeroUpgradeTool } from "./write/account/aero-upgrade.js";
import { registerUpgradeVeloTool } from "./write/wallet/upgrade-velo.js";

const SLIPSTREAM_PM = "0x827922686190790b37229fD06084350E74485b72";
const AERO_POOL = "0x00000000000000000000000000000000000a3a01";
const OTHER_POOL = "0x00000000000000000000000000000000000a3a02";
const OTHER_ACCOUNT = "0x00000000000000000000000000000000000000bb";
const OLD_AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const NEW_AERO = "0x3f5bF3EdAc59d650D8fDf9657a71F2f904A3a4Ee";
const OLD_REBALANCER = "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F";
const NEW_REBALANCER = "0x9EA47b9db58970Ab5Ea686a5CaC3e80ec652d755";
const OPENS_AT = 1_792_627_200;
const SUFFIX = DATA_SUFFIX.slice(2);

const managers = [
  {
    kind: "rebalancer",
    old_address: OLD_REBALANCER,
    new_address: NEW_REBALANCER,
    initiator: TEST_ADDRESS,
  },
];

function option(pool: string, over: Record<string, unknown> = {}) {
  return {
    pool,
    tick_spacing: 100,
    fee: 500,
    strategy_id: 42,
    apy: 0.3,
    tvl_usd: 1_000_000,
    is_new: false,
    tick_lower: -1000,
    tick_upper: 1000,
    range_widened: false,
    default: true,
    price_ok: true,
    price_deviation_bps: 10,
    disabled_reason: null,
    ...over,
  };
}

function positionItem(over: Record<string, unknown> = {}) {
  return {
    kind: "position",
    id: `${SLIPSTREAM_PM}:7`,
    status: "ready",
    source: {
      protocol: "staked_slipstream_v3",
      position_manager: SLIPSTREAM_PM,
      position_id: 7,
      pool: OTHER_POOL,
      token0: "0x4200000000000000000000000000000000000006",
      token1: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tick_lower: -1000,
      tick_upper: 1000,
      tick_spacing: 100,
      amount0: "1",
      amount1: "2",
      value_usd: 1234.5,
    },
    target: { pool: AERO_POOL, pool_type: 9, tick_spacing: 100 },
    options: [option(AERO_POOL)],
    rewards: null,
    old_aero_leg: null,
    reason: null,
    ...over,
  };
}

function plan(over: Record<string, unknown> = {}) {
  return {
    chain_id: 8453,
    account_address: TEST_ACCOUNT,
    owner: TEST_ADDRESS,
    is_spot: false,
    status: "ready",
    opens_at: OPENS_AT,
    items: [positionItem()],
    calls: [
      { kind: "flash_action", to: TEST_ACCOUNT, data: "0xabcdef", value: "0", gas: "2700000" },
    ],
    managers_to_reconnect: managers,
    old_managers_still_needed: false,
    simulation: { status: true, url: "https://dashboard.tenderly.co/sim/1", error: null },
    price_tolerance_bps: 150,
    ...over,
  };
}

function apiError(status: number, body: Record<string, unknown>) {
  return new ArcadiaApiError(`Arcadia API error (${status})`, status, body);
}

function readTool(api: Record<string, unknown>) {
  const mock = createMockServer();
  registerAeroUpgradeReadTool(mock.server, api as never);
  return mock.getHandler("read.account.aero_upgrade");
}

function writeTool(api: Record<string, unknown>) {
  const mock = createMockServer();
  registerAeroUpgradeTool(mock.server, api as never);
  return mock.getHandler("write.account.aero_upgrade");
}

function veloTool(api: Record<string, unknown>) {
  const mock = createMockServer();
  registerUpgradeVeloTool(mock.server, api as never);
  return mock.getHandler("write.wallet.upgrade_velo");
}

describe("read.account.aero_upgrade", () => {
  const candidates = {
    chain_id: 8453,
    owner_address: TEST_ADDRESS,
    opens_at: OPENS_AT,
    checked_at: 1_792_500_000,
    accounts: [
      {
        account_address: TEST_ACCOUNT,
        is_spot: false,
        status: "ready",
        positions: 2,
        old_aero: "0",
        movable: 1,
        waiting: 1,
        blocked: 0,
      },
    ],
  };

  it("checks every account of a wallet and returns the summary unchanged", async () => {
    const api = { getAeroUpgradeCandidates: vi.fn(async () => candidates) };
    const result = await readTool(api)({ wallet_address: TEST_ADDRESS, chain_id: 8453 });
    expect(result.isError).toBeUndefined();
    expect(api.getAeroUpgradeCandidates).toHaveBeenCalledWith({
      chain_id: 8453,
      owner_address: TEST_ADDRESS,
      account_address: undefined,
    });
    expect(parseToolResponse(result)).toEqual(candidates);
  });

  it("checks one account", async () => {
    const api = { getAeroUpgradeCandidates: vi.fn(async () => candidates) };
    await readTool(api)({ account_address: TEST_ACCOUNT, chain_id: 10 });
    expect(api.getAeroUpgradeCandidates).toHaveBeenCalledWith({
      chain_id: 10,
      owner_address: undefined,
      account_address: TEST_ACCOUNT,
    });
  });

  it.each([
    [{ chain_id: 8453 }, "exactly one of wallet_address and account_address"],
    [
      { wallet_address: TEST_ADDRESS, account_address: TEST_ACCOUNT, chain_id: 8453 },
      "exactly one of wallet_address and account_address",
    ],
    [{ wallet_address: TEST_ADDRESS, chain_id: 130 }, "not on chain 130"],
    [{ wallet_address: "0x12", chain_id: 8453 }, "Invalid wallet_address"],
  ])("rejects %o before calling the backend", async (args, message) => {
    const api = { getAeroUpgradeCandidates: vi.fn() };
    const result = await readTool(api)(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(message);
    expect(api.getAeroUpgradeCandidates).not.toHaveBeenCalled();
  });

  it("passes a 422 through with the backend's message", async () => {
    const api = {
      getAeroUpgradeCandidates: vi.fn(async () => {
        throw apiError(422, {
          name: "Unsupported Chain",
          message: "Aero is not deployed on chain 8453",
        });
      }),
    };
    const result = await readTool(api)({ wallet_address: TEST_ADDRESS, chain_id: 8453 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("422): Aero is not deployed on chain 8453");
  });
});

describe("write.account.aero_upgrade: one account", () => {
  it("returns the plan with the flashAction as an unsigned transaction and the ERC-8021 suffix", async () => {
    const api = { getAeroUpgradePlan: vi.fn(async () => plan()) };
    const result = await writeTool(api)({ account_address: TEST_ACCOUNT, chain_id: 8453 });

    expect(result.isError).toBeUndefined();
    expect(api.getAeroUpgradePlan).toHaveBeenCalledWith({
      chain_id: 8453,
      account_address: TEST_ACCOUNT,
      choices: undefined,
      slippage: undefined,
    });
    const data = parseToolResponse(result);
    expect(data.status).toBe("ready");
    expect(data.transaction).toEqual({
      to: TEST_ACCOUNT,
      data: `0xabcdef${SUFFIX}`,
      value: "0",
      chainId: 8453,
    });
    expect(data.gas).toBe("2700000");
    expect(data.tenderly_sim_status).toBe("success");
    expect(data.tenderly_sim_url).toBe("https://dashboard.tenderly.co/sim/1");
    expect(data.items).toHaveLength(1);
    expect(data.managers_to_reconnect).toEqual(managers);
    expect(data.old_managers_still_needed).toBe(false);
    expect(data.description).toContain("1 of 1 item ready");
    expect(data.next_steps.join(" ")).toContain("write.account.automations");
    expect(data.next_steps.join(" ")).toContain("read.account.info");
    expect(data.next_steps.join(" ")).not.toContain("automations_delta");
  });

  it("sends the pool picks as position_manager:position_id:pool strings with the slippage", async () => {
    const api = { getAeroUpgradePlan: vi.fn(async () => plan()) };
    await writeTool(api)({
      account_address: TEST_ACCOUNT,
      choices: [
        { position_manager: SLIPSTREAM_PM, position_id: 7, pool: AERO_POOL },
        { position_manager: SLIPSTREAM_PM, position_id: 9, pool: OTHER_POOL },
      ],
      slippage: 300,
      chain_id: 10,
    });
    expect(api.getAeroUpgradePlan).toHaveBeenCalledWith({
      chain_id: 10,
      account_address: TEST_ACCOUNT,
      choices: [`${SLIPSTREAM_PM}:7:${AERO_POOL}`, `${SLIPSTREAM_PM}:9:${OTHER_POOL}`],
      slippage: 300,
    });
  });

  it("returns the options and no transaction while a pool choice is required", async () => {
    const api = {
      getAeroUpgradePlan: vi.fn(async () =>
        plan({
          status: "choices_required",
          calls: [],
          items: [
            positionItem({
              status: "choose",
              target: null,
              options: [
                option(AERO_POOL, { default: false, tick_spacing: 200 }),
                option(OTHER_POOL, {
                  default: false,
                  tick_spacing: 50,
                  disabled_reason: { code: "range_mismatch", message: "cannot hold your range" },
                }),
              ],
            }),
          ],
          simulation: { status: null, url: null, error: null },
        }),
      ),
    };
    const data = parseToolResponse(
      await writeTool(api)({ account_address: TEST_ACCOUNT, chain_id: 8453 }),
    );
    expect(data.status).toBe("choices_required");
    expect(data.transaction).toBeUndefined();
    expect(data.status_note).toContain("disabled_reason is null");
    expect(data.status_note).toContain("choices");
    expect(data.items[0].options).toHaveLength(2);
    expect(data.tenderly_sim_status).toBe("unavailable");
    expect(data.next_steps).toEqual([]);
  });

  it("explains waiting and not_open plans instead of inventing a transaction", async () => {
    const waiting = parseToolResponse(
      await writeTool({
        getAeroUpgradePlan: vi.fn(async () =>
          plan({
            status: "waiting",
            calls: [],
            items: [
              positionItem({
                status: "waiting",
                reason: { code: "aero_not_live", message: "Aero upgrades open once ..." },
              }),
            ],
            simulation: { status: null, url: null, error: null },
          }),
        ),
      })({ account_address: TEST_ACCOUNT, chain_id: 8453 }),
    );
    expect(waiting.transaction).toBeUndefined();
    expect(waiting.status_note).toContain("Do not retry in a loop");

    const notOpen = parseToolResponse(
      await writeTool({
        getAeroUpgradePlan: vi.fn(async () =>
          plan({
            status: "not_open",
            calls: [],
            items: [
              {
                kind: "token",
                id: OLD_AERO,
                status: "ready",
                amount: "5",
                becomes: NEW_AERO,
                reason: null,
              },
            ],
            simulation: { status: null, url: null, error: null },
          }),
        ),
      })({ account_address: TEST_ACCOUNT, chain_id: 8453 }),
    );
    expect(notOpen.transaction).toBeUndefined();
    expect(notOpen.status_note).toContain("2026-10-22T00:00:00.000Z");
  });

  it("keeps the old managers when a Slipstream position stays behind", async () => {
    const api = {
      getAeroUpgradePlan: vi.fn(async () =>
        plan({
          old_managers_still_needed: true,
          items: [
            positionItem(),
            positionItem({
              id: `${SLIPSTREAM_PM}:8`,
              status: "waiting",
              reason: { code: "pool_not_on_aero", message: "Your pool isn't on Aero yet." },
            }),
          ],
        }),
      ),
    };
    const data = parseToolResponse(
      await writeTool(api)({ account_address: TEST_ACCOUNT, chain_id: 8453 }),
    );
    expect(data.description).toContain("1 of 2 items ready");
    expect(data.next_steps.join(" ")).toContain("automations_delta");
  });

  it("refuses to hand out a transaction whose simulation failed", async () => {
    const api = {
      getAeroUpgradePlan: vi.fn(async () =>
        plan({
          simulation: {
            status: false,
            url: "https://dashboard.tenderly.co/sim/2",
            error: "PriceOutOfRange",
          },
        }),
      ),
    };
    const result = await writeTool(api)({ account_address: TEST_ACCOUNT, chain_id: 8453 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("do NOT broadcast");
    expect(result.content[0].text).toContain("PriceOutOfRange");
    expect(result.content[0].text).toContain("https://dashboard.tenderly.co/sim/2");
  });

  it("passes 422 and 404 through with the backend's message", async () => {
    const rejected = await writeTool({
      getAeroUpgradePlan: vi.fn(async () => {
        throw apiError(422, {
          name: "Incomplete Request",
          message: `${OTHER_POOL} is not a selectable Aero pool for ${SLIPSTREAM_PM}:7`,
        });
      }),
    })({ account_address: TEST_ACCOUNT, chain_id: 8453 });
    expect(rejected.isError).toBe(true);
    expect(rejected.content[0].text).toContain("422): 0x0000");

    const missing = await writeTool({
      getAeroUpgradePlan: vi.fn(async () => {
        throw apiError(404, {
          name: "Account Not Found",
          message: `${TEST_ACCOUNT} is not an Arcadia account on chain 8453`,
        });
      }),
    })({ account_address: TEST_ACCOUNT, chain_id: 8453 });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain("not found (404)");
  });

  it("refuses a plan with more than one call instead of signing only the first", async () => {
    const call = {
      kind: "flash_action",
      to: TEST_ACCOUNT,
      data: "0xabcdef",
      value: "0",
      gas: null,
    };
    const api = { getAeroUpgradePlan: vi.fn(async () => plan({ calls: [call, call] })) };
    const result = await writeTool(api)({ account_address: TEST_ACCOUNT, chain_id: 8453 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("expected one flashAction");
  });

  it("keeps a generic 503 as a retryable outage", async () => {
    const api = {
      getAeroUpgradePlan: vi.fn(async () => {
        throw new ArcadiaApiError(
          "Arcadia API error (503 on /bundles/aero_upgrade): Backend is temporarily unavailable. Retry after a few seconds.",
          503,
          { message: "Upstream service error" },
        );
      }),
    };
    const result = await writeTool(api)({ account_address: TEST_ACCOUNT, chain_id: 8453 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("temporarily unavailable");
  });

  it.each([
    [{ chain_id: 8453 }, "exactly one of account_address and accounts"],
    [
      { account_address: TEST_ACCOUNT, accounts: [OTHER_ACCOUNT], chain_id: 8453 },
      "exactly one of account_address and accounts",
    ],
    [{ account_address: TEST_ACCOUNT, chain_id: 130 }, "not on chain 130"],
    [
      {
        account_address: TEST_ACCOUNT,
        choices: [{ position_manager: "0x1", position_id: 7, pool: AERO_POOL }],
        chain_id: 8453,
      },
      "Invalid choices[].position_manager",
    ],
  ])("rejects %o before calling the backend", async (args, message) => {
    const api = { getAeroUpgradePlan: vi.fn(), postAeroUpgradeBatch: vi.fn() };
    const result = await writeTool(api)(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(message);
    expect(api.getAeroUpgradePlan).not.toHaveBeenCalled();
    expect(api.postAeroUpgradeBatch).not.toHaveBeenCalled();
  });
});

describe("write.account.aero_upgrade: several accounts", () => {
  it("returns one plan per account, keeps error slots, and drops the transaction of a failed simulation", async () => {
    const api = {
      postAeroUpgradeBatch: vi.fn(async () => ({
        chain_id: 8453,
        max_gas_per_tx: 12_000_000,
        results: [
          plan(),
          {
            account_address: OTHER_ACCOUNT,
            status: "error",
            error: "the upgrade could not be built",
          },
          plan({
            account_address: "0x00000000000000000000000000000000000000cc",
            simulation: { status: false, url: null, error: "SwapFailed" },
          }),
        ],
      })),
    };
    const accounts = [TEST_ACCOUNT, OTHER_ACCOUNT, "0x00000000000000000000000000000000000000cc"];
    const result = await writeTool(api)({
      accounts,
      choices: [{ position_manager: SLIPSTREAM_PM, position_id: 7, pool: AERO_POOL }],
      chain_id: 8453,
    });

    expect(result.isError).toBeUndefined();
    expect(api.postAeroUpgradeBatch).toHaveBeenCalledWith({
      chain_id: 8453,
      accounts,
      choices: [`${SLIPSTREAM_PM}:7:${AERO_POOL}`],
      slippage: undefined,
    });
    const data = parseToolResponse(result);
    expect(data.description).toContain("3 accounts");
    expect(data.description).toContain("1 transaction");
    expect(data.max_gas_per_tx).toBe(12_000_000);
    expect(data.results).toHaveLength(3);
    expect(data.results[0].transaction.data).toBe(`0xabcdef${SUFFIX}`);
    expect(data.results[1]).toEqual({
      account_address: OTHER_ACCOUNT,
      status: "error",
      error: "the upgrade could not be built",
    });
    expect(data.results[2].transaction).toBeUndefined();
    expect(data.results[2].error).toContain("do NOT broadcast");
    expect(data.results[2].error).toContain("SwapFailed");
    expect(data.next_steps.join(" ")).toContain("MultiSend");
  });

  it("rejects more than ten accounts before calling the backend", async () => {
    const api = { postAeroUpgradeBatch: vi.fn() };
    const result = await writeTool(api)({
      accounts: Array.from({ length: 11 }, () => TEST_ACCOUNT),
      chain_id: 8453,
    });
    expect(result.isError).toBe(true);
    expect(api.postAeroUpgradeBatch).not.toHaveBeenCalled();
  });
});

describe("write.wallet.upgrade_velo", () => {
  it("refuses an amount above the wallet balance, since the deposit would revert", async () => {
    const api = {
      getUpgradeVeloCalldata: vi.fn(async () => ({
        chain_id: 10,
        amount_in: "1000",
        wallet_balance: "10",
        calls: [],
      })),
    };
    const result = await veloTool(api)({
      owner_address: TEST_ADDRESS,
      amount: "1000",
      chain_id: 10,
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
        new_token: NEW_AERO,
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
      await veloTool(api)({ owner_address: TEST_ADDRESS, chain_id: 10 }),
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

  it("explains a 409 upgrade-unavailable reason with its opening time", async () => {
    const api = {
      getUpgradeVeloCalldata: vi.fn(async () => {
        throw apiError(409, {
          name: "VELO Upgrade Unavailable",
          reason: "not_open",
          message: "The VELO migration opens at 1792627200.",
          opens_at: OPENS_AT,
        });
      }),
    };
    const result = await veloTool(api)({ owner_address: TEST_ADDRESS, chain_id: 10 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("upgrade unavailable (not_open)");
    expect(result.content[0].text).toContain("2026-10-22T00:00:00.000Z");
  });

  it.each([
    [{ owner_address: TEST_ADDRESS, amount: "1.5", chain_id: 10 }, "Invalid amount"],
    [{ owner_address: TEST_ADDRESS, chain_id: 8453 }, "runs on Optimism"],
    [{ owner_address: "0xnope", chain_id: 10 }, "Invalid owner_address"],
  ])("rejects %o before calling the backend", async (args, message) => {
    const api = { getUpgradeVeloCalldata: vi.fn() };
    const result = await veloTool(api)(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(message);
    expect(api.getUpgradeVeloCalldata).not.toHaveBeenCalled();
  });
});
