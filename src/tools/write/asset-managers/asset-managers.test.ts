import { describe, it, expect, vi } from "vitest";
import { decodeFunctionData, encodeFunctionData } from "viem";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { createMockServer, parseToolResponse, TEST_ACCOUNT } from "../../../test-utils.js";
import { registerAutomationsTools } from "./automations.js";
import { registerAssetManagerTools } from "../../read/asset-managers.js";
import { DATA_SUFFIX } from "../../../utils/attribution.js";
import { accountAbi } from "../../../abis/index.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const COMPOUNDER = "0x467837f44A71e3eAB90AEcfC995c84DC6B3cfCF7";
const REBALANCER = "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F";

// Real setAssetManagers calldata, so the tool's output stays decodable.
// The data blob is a v3 packed envelope: [version=3][intent_flags u16][body].
const SET_AM_CALLDATA = encodeFunctionData({
  abi: accountAbi,
  functionName: "setAssetManagers",
  args: [[COMPOUNDER as `0x${string}`], [true], ["0x03000100" as `0x${string}`]],
});

function planResponse(overrides: Record<string, unknown> = {}) {
  return {
    valid: true,
    errors: [],
    warnings: [],
    plan: [
      {
        manager: "compounder",
        address: COMPOUNDER,
        enabled: true,
        strategy: "cow_swap_compound",
        serving_intents: ["compound_fees"],
      },
    ],
    diff: {
      added: [{ manager: "compounder", address: COMPOUNDER, enabled: true }],
      removed: [],
      updated: [],
    },
    calldata: SET_AM_CALLDATA,
    human_summary: ["Reinvest earned fees and rewards back into the LP."],
    ...overrides,
  };
}

function setup(apiOverrides: Record<string, unknown> = {}) {
  const mock = createMockServer();
  const api = {
    saveAutomations: vi.fn(async () => planResponse()),
    previewAutomations: vi.fn(async () => planResponse()),
    applyAutomationsDelta: vi.fn(async () => planResponse()),
    getCurrentAutomations: vi.fn(async () => ({
      account: TEST_ACCOUNT,
      chain_id: 8453,
      enabled: [],
      inferred_intents: [],
      warnings: [],
      merkl: null,
      read_ok: true,
    })),
    getAvailableAutomations: vi.fn(async () => ({
      account: TEST_ACCOUNT,
      chain_id: 8453,
      intents: [
        { kind: "compound_fees", available: true, reason: null },
        {
          kind: "claim_rewards",
          available: false,
          reason: "compound_and_claim: would race for the same fees",
        },
      ],
    })),
    ...apiOverrides,
  } as unknown as ArcadiaApiClient;

  registerAutomationsTools(mock.server, api);
  registerAssetManagerTools(mock.server, api);
  return { mock, api: api as unknown as Record<string, ReturnType<typeof vi.fn>> };
}

describe("write.account.automations", () => {
  it("sends the intents to /save and returns the unsigned transaction", async () => {
    const { mock, api } = setup();
    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees", enabled: true }],
      mode: "save",
      position_id: 42,
      chain_id: 8453,
    });

    const parsed = parseToolResponse(result);
    expect(result.isError).toBeFalsy();
    expect(parsed.valid).toBe(true);
    expect(parsed.transaction.to.toLowerCase()).toBe(TEST_ACCOUNT.toLowerCase());
    expect(parsed.transaction.value).toBe("0");
    expect(parsed.transaction.chainId).toBe(8453);
    expect(parsed.human_summary).toHaveLength(1);
    expect(parsed.diff.added).toHaveLength(1);

    expect(api.saveAutomations).toHaveBeenCalledWith(TEST_ACCOUNT, 8453, {
      intents: [{ kind: "compound_fees", enabled: true }],
      position_id: 42,
    });
    expect(api.previewAutomations).not.toHaveBeenCalled();
  });

  it("routes mode=preview to /preview and returns no signable transaction", async () => {
    // Preview does not diff against chain state, so its calldata would leave
    // omitted automations enabled. It must not come back as a transaction.
    const { mock, api } = setup();
    const parsed = parseToolResponse(
      await mock.getHandler("write.account.automations")({
        account_address: TEST_ACCOUNT,
        intents: [{ kind: "claim_merkl" }],
        mode: "preview",
        chain_id: 8453,
      }),
    );

    expect(api.previewAutomations).toHaveBeenCalledOnce();
    expect(api.saveAutomations).not.toHaveBeenCalled();
    expect(parsed.preview_only).toBe(true);
    expect(parsed.transaction).toBeUndefined();
    expect(parsed.plan).toHaveLength(1);
    expect(parsed.description).toContain('mode "save"');
  });

  it("previews a valid empty plan cleanly even without calldata", async () => {
    // The disable-everything idiom resolves to an empty plan. Preview does not use
    // calldata, so absent calldata must not surface as a rejection.
    const { mock } = setup({
      previewAutomations: vi.fn(async () => planResponse({ plan: [], calldata: null })),
    });

    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees", enabled: false }],
      mode: "preview",
      chain_id: 8453,
    });

    expect(result.isError).toBeFalsy();
    const parsed = parseToolResponse(result);
    expect(parsed.preview_only).toBe(true);
    expect(parsed.plan).toEqual([]);
    expect(parsed.transaction).toBeUndefined();
  });

  it("still rejects a save with no calldata", async () => {
    const { mock } = setup({
      saveAutomations: vi.fn(async () => planResponse({ calldata: null })),
    });

    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
  });

  it("still surfaces a compatibility rejection in preview mode", async () => {
    const { mock } = setup({
      previewAutomations: vi.fn(async () =>
        planResponse({
          valid: false,
          calldata: null,
          errors: [
            { rule: "incomplete_partition", severity: "hard", reason: "some token unassigned" },
          ],
        }),
      ),
    });

    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees", tokens: ["token0"] }],
      mode: "preview",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("incomplete_partition");
  });

  it("appends the ERC-8021 attribution suffix to the backend calldata", async () => {
    const { mock } = setup();
    const parsed = parseToolResponse(
      await mock.getHandler("write.account.automations")({
        account_address: TEST_ACCOUNT,
        intents: [{ kind: "compound_fees" }],
        mode: "save",
        chain_id: 8453,
      }),
    );

    expect(parsed.transaction.data.endsWith(DATA_SUFFIX.slice(2))).toBe(true);
    // The suffix must not corrupt the call it is attached to.
    const decoded = decodeFunctionData({ abi: accountAbi, data: SET_AM_CALLDATA as `0x${string}` });
    expect(decoded.functionName).toBe("setAssetManagers");
  });

  it("translates a staked dex_protocol into protocol + is_staked", async () => {
    const { mock, api } = setup();
    await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      protocol: "staked_slipstream_v3",
      chain_id: 8453,
    });

    expect(api.saveAutomations).toHaveBeenCalledWith(TEST_ACCOUNT, 8453, {
      intents: [{ kind: "compound_fees" }],
      protocol: "slipstream_v3",
      is_staked: true,
    });
  });

  it("lets an explicit is_staked override the protocol spelling", async () => {
    const { mock, api } = setup();
    await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      protocol: "staked_slipstream_v3",
      is_staked: false,
      chain_id: 8453,
    });

    const body = api.saveAutomations.mock.calls[0][2] as Record<string, unknown>;
    expect(body.protocol).toBe("slipstream_v3");
    expect(body.is_staked).toBe(false);
  });

  it("passes canonical protocol names through untouched", async () => {
    const { mock, api } = setup();
    await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      protocol: "uniswap_v4",
      chain_id: 8453,
    });

    const body = api.saveAutomations.mock.calls[0][2] as Record<string, unknown>;
    expect(body.protocol).toBe("uniswap_v4");
    expect(body.is_staked).toBeUndefined();
  });

  it("omits position-context fields that were not supplied", async () => {
    const { mock, api } = setup();
    await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "claim_merkl" }],
      mode: "save",
      chain_id: 8453,
    });

    expect(api.saveAutomations.mock.calls[0][2]).toEqual({ intents: [{ kind: "claim_merkl" }] });
  });

  it("errors with the failing rule when the plan is invalid", async () => {
    const { mock } = setup({
      saveAutomations: vi.fn(async () =>
        planResponse({
          valid: false,
          calldata: null,
          errors: [
            {
              rule: "claim_convert_to_wallet",
              severity: "hard",
              reason:
                "CowSwap settles in the account, so a converted claim cannot pay out to a wallet",
            },
          ],
        }),
      ),
    });

    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [
        {
          kind: "claim_rewards",
          config: { mode: "convert_to", destination: "wallet", buy_token: USDC },
        },
      ],
      mode: "save",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("claim_convert_to_wallet");
    expect(result.content[0].text).toContain("CowSwap settles in the account");
  });

  it("errors when a valid plan produced no calldata", async () => {
    const { mock } = setup({
      saveAutomations: vi.fn(async () => planResponse({ calldata: null })),
    });

    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no calldata");
  });

  it("returns no transaction when the diff is empty instead of a no-op call", async () => {
    const { mock } = setup({
      saveAutomations: vi.fn(async () =>
        planResponse({ diff: { added: [], removed: [], updated: [] } }),
      ),
    });

    const parsed = parseToolResponse(
      await mock.getHandler("write.account.automations")({
        account_address: TEST_ACCOUNT,
        intents: [{ kind: "compound_fees" }],
        mode: "save",
        chain_id: 8453,
      }),
    );

    expect(parsed.no_changes_needed).toBe(true);
    expect(parsed.transaction).toBeUndefined();
    expect(parsed.description).toContain("nothing to change");
  });

  it("refuses to hand back a transaction whose simulation predicted a revert", async () => {
    const { mock } = setup({
      saveAutomations: vi.fn(async () =>
        planResponse({
          simulation_url: "https://dashboard.tenderly.co/shared/simulation/abc",
          simulation_success: false,
        }),
      ),
    });

    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("do NOT broadcast");
    expect(result.content[0].text).toContain("tenderly.co");
  });

  it("treats a simulation that could not run as unavailable, not a failure", async () => {
    // The proxy reports simulation_success=false with no URL when no owner was
    // supplied, which must not condemn the transaction.
    const { mock } = setup({
      saveAutomations: vi.fn(async () => planResponse({ simulation_success: false })),
    });

    const parsed = parseToolResponse(
      await mock.getHandler("write.account.automations")({
        account_address: TEST_ACCOUNT,
        intents: [{ kind: "compound_fees" }],
        mode: "save",
        chain_id: 8453,
      }),
    );

    expect(parsed.tenderly_sim_status).toBe("unavailable");
    expect(parsed.transaction).toBeDefined();
  });

  it("does not treat a missing simulation_success as a pass", async () => {
    // An ambiguous response must not read as a green light.
    const { mock } = setup({
      saveAutomations: vi.fn(async () =>
        planResponse({ simulation_url: "https://dashboard.tenderly.co/shared/simulation/x" }),
      ),
    });

    const parsed = parseToolResponse(
      await mock.getHandler("write.account.automations")({
        account_address: TEST_ACCOUNT,
        intents: [{ kind: "compound_fees" }],
        mode: "save",
        chain_id: 8453,
      }),
    );

    expect(parsed.tenderly_sim_status).toBe("unavailable");
  });

  it("reports a passing simulation as success", async () => {
    const { mock } = setup({
      saveAutomations: vi.fn(async () =>
        planResponse({
          simulation_url: "https://dashboard.tenderly.co/shared/simulation/ok",
          simulation_success: true,
        }),
      ),
    });

    const parsed = parseToolResponse(
      await mock.getHandler("write.account.automations")({
        account_address: TEST_ACCOUNT,
        intents: [{ kind: "compound_fees" }],
        mode: "save",
        chain_id: 8453,
      }),
    );

    expect(parsed.tenderly_sim_status).toBe("success");
    expect(parsed.transaction).toBeDefined();
  });

  it("rejects an invalid account address before calling the API", async () => {
    const { mock, api } = setup();
    const result = await mock.getHandler("write.account.automations")({
      account_address: "not-an-address",
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(api.saveAutomations).not.toHaveBeenCalled();
  });

  it("rejects an unsupported chain", async () => {
    const { mock, api } = setup();
    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      chain_id: 1,
    });

    expect(result.isError).toBe(true);
    expect(api.saveAutomations).not.toHaveBeenCalled();
  });

  it("surfaces an API failure as a tool error", async () => {
    const { mock } = setup({
      saveAutomations: vi.fn(async () => {
        throw new Error("Arcadia API error (503 on /automations): upstream unavailable");
      }),
    });

    const result = await mock.getHandler("write.account.automations")({
      account_address: TEST_ACCOUNT,
      intents: [{ kind: "compound_fees" }],
      mode: "save",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("503");
  });
});

describe("write.account.automations_delta", () => {
  it("forwards enable + disable to /apply", async () => {
    const { mock, api } = setup();
    const result = await mock.getHandler("write.account.automations_delta")({
      account_address: TEST_ACCOUNT,
      enable: [{ kind: "rebalance" }],
      disable: [REBALANCER],
      chain_id: 8453,
    });

    expect(result.isError).toBeFalsy();
    expect(api.applyAutomationsDelta).toHaveBeenCalledWith(TEST_ACCOUNT, 8453, {
      enable: [{ kind: "rebalance" }],
      disable: [REBALANCER],
    });
  });

  it("allows a disable-only delta", async () => {
    const { mock, api } = setup();
    const result = await mock.getHandler("write.account.automations_delta")({
      account_address: TEST_ACCOUNT,
      enable: [],
      disable: [COMPOUNDER],
      chain_id: 8453,
    });

    expect(result.isError).toBeFalsy();
    const body = api.applyAutomationsDelta.mock.calls[0][2] as Record<string, unknown>;
    expect(body.enable).toEqual([]);
    expect(body.disable).toEqual([COMPOUNDER]);
  });

  it("errors when neither enable nor disable is supplied", async () => {
    const { mock, api } = setup();
    const result = await mock.getHandler("write.account.automations_delta")({
      account_address: TEST_ACCOUNT,
      enable: [],
      disable: [],
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(api.applyAutomationsDelta).not.toHaveBeenCalled();
  });

  it("rejects an enabled:false entry in enable[] instead of silently doing nothing", async () => {
    // The backend resolves only enabled intents, so such an entry would be dropped.
    const { mock, api } = setup();
    const result = await mock.getHandler("write.account.automations_delta")({
      account_address: TEST_ACCOUNT,
      enable: [{ kind: "compound_fees", enabled: false }],
      disable: [],
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("enabled: false");
    expect(result.content[0].text).toContain("disable");
    expect(api.applyAutomationsDelta).not.toHaveBeenCalled();
  });

  it("rejects a malformed disable address", async () => {
    const { mock, api } = setup();
    const result = await mock.getHandler("write.account.automations_delta")({
      account_address: TEST_ACCOUNT,
      enable: [],
      disable: ["0xnope"],
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(api.applyAutomationsDelta).not.toHaveBeenCalled();
  });
});

describe("read.asset_manager.intents", () => {
  it("returns the catalog without an account and does not call the API", async () => {
    const { mock, api } = setup();
    const parsed = parseToolResponse(
      await mock.getHandler("read.asset_manager.intents")({ chain_id: 8453 }),
    );

    expect(parsed.automations.map((a: { kind: string }) => a.kind)).toEqual([
      "compound_fees",
      "claim_rewards",
      "add_to_lp",
      "claim_merkl",
      "rebalance",
    ]);
    expect(parsed.automations[0].available).toBeUndefined();
    expect(api.getAvailableAutomations).not.toHaveBeenCalled();
  });

  it("merges live availability when an account is supplied", async () => {
    const { mock, api } = setup();
    const parsed = parseToolResponse(
      await mock.getHandler("read.asset_manager.intents")({
        account_address: TEST_ACCOUNT,
        position_id: 7,
        chain_id: 8453,
      }),
    );

    expect(api.getAvailableAutomations).toHaveBeenCalledWith(TEST_ACCOUNT, 8453, 7);
    const byKind = Object.fromEntries(parsed.automations.map((a: { kind: string }) => [a.kind, a]));
    expect(byKind.compound_fees.available).toBe(true);
    expect(byKind.claim_rewards.available).toBe(false);
    expect(byKind.claim_rewards.unavailable_reason).toContain("compound_and_claim");
    // Kinds the backend did not report keep the catalog entry untouched.
    expect(byKind.rebalance.available).toBeUndefined();
  });

  it("degrades to the catalog when availability cannot be read", async () => {
    const { mock } = setup({
      getAvailableAutomations: vi.fn(async () => {
        throw new Error("Arcadia API error (503 on /automations/available): upstream unavailable");
      }),
    });

    const parsed = parseToolResponse(
      await mock.getHandler("read.asset_manager.intents")({
        account_address: TEST_ACCOUNT,
        chain_id: 8453,
      }),
    );

    expect(parsed.automations).toHaveLength(5);
    expect(parsed.availability_error).toContain("503");
    // Nothing is guessed: no intent claims availability either way.
    expect(
      parsed.automations.every((a: { available?: boolean }) => a.available === undefined),
    ).toBe(true);
  });

  it("rejects position_id without an account", async () => {
    const { mock } = setup();
    const result = await mock.getHandler("read.asset_manager.intents")({
      position_id: 7,
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("requires account_address");
  });
});

describe("read.asset_manager.current", () => {
  it("splits current managers from superseded ones", async () => {
    const { mock } = setup({
      getCurrentAutomations: vi.fn(async () => ({
        account: TEST_ACCOUNT,
        chain_id: 8453,
        enabled: [
          {
            manager: "compounder",
            protocol: "slipstream_v1",
            address: COMPOUNDER,
            enabled: true,
            deprecated: false,
            active: true,
          },
          {
            manager: "cow_swapper",
            protocol: "",
            address: "0xFfC742E68D41389BE9Ef1aFD518F036064DA2Bb6",
            enabled: true,
            deprecated: true,
            version: "1.1.0",
          },
        ],
        inferred_intents: ["compound_fees"],
        warnings: [],
        merkl: null,
        read_ok: true,
      })),
    });

    const parsed = parseToolResponse(
      await mock.getHandler("read.asset_manager.current")({
        account_address: TEST_ACCOUNT,
        chain_id: 8453,
      }),
    );

    expect(parsed.enabled).toHaveLength(1);
    expect(parsed.enabled[0].manager).toBe("compounder");
    expect(parsed.deprecated).toHaveLength(1);
    expect(parsed.deprecated[0].version).toBe("1.1.0");
    expect(parsed.inferred_intents).toEqual(["compound_fees"]);
    expect(parsed.read_ok).toBe(true);
  });

  it("reports read_ok=false rather than an empty state", async () => {
    const { mock } = setup({
      getCurrentAutomations: vi.fn(async () => ({
        account: TEST_ACCOUNT,
        chain_id: 8453,
        enabled: [],
        inferred_intents: [],
        warnings: ["account could not be confirmed on-chain; state is unknown"],
        merkl: null,
        read_ok: false,
      })),
    });

    const parsed = parseToolResponse(
      await mock.getHandler("read.asset_manager.current")({
        account_address: TEST_ACCOUNT,
        chain_id: 8453,
      }),
    );

    expect(parsed.read_ok).toBe(false);
    expect(parsed.warnings).toHaveLength(1);
  });
});
