import { beforeEach, describe, it, expect, vi } from "vitest";
import { createMockServer, createMockChains, parseToolResponse } from "../../test-utils.js";
import { registerAccountTools } from "./account.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

const BASE_ACCOUNT = "0x75983c3e2FE16A61fbcE9B4d353E1CB7addB8FC5";
const OWNER = "0x000000000000000000000000000000000000beef";

// A V2.1.0 slipstream rebalancer. The MCP server no longer keeps an asset-manager
// address book: the automations backend reports whatever version an account is
// registered on, so an older deployment is still reported as active.
const REBALANCER_V2_1_0_SLIPSTREAM_V1 = "0xE07A9383AF8E0B1320419dFeF205bb9bA75f3Ef2";
// Superseded CowSwapper V1.0, still set on a small number of accounts.
const COW_SWAPPER_OLD = "0xc928013A219EC9F18dE7B2dee6A50Ba626811854";

const GAS_RELAYER = "0xD938C8d04cF91094fecAF0A2018EAac483a40137";

// ACCOUNT_VERSION returns 2n; isAssetManager is the gas-relayer probe.
let gasRelayerEnabled = false;
vi.mock("../../clients/chain.js", () => ({
  getPublicClient: vi.fn(() => ({
    readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
      functionName === "isAssetManager" ? gasRelayerEnabled : 2n,
    ),
    multicall: vi.fn(async () => []),
  })),
}));

type Manager = Record<string, unknown>;

function setup(state: Partial<Record<string, unknown>> = {}, currentImpl?: () => Promise<unknown>) {
  const mock = createMockServer();
  const api = {
    getAccountOverview: vi.fn(async () => ({ owner: OWNER, health_factor: 1, total_open_debt: 0 })),
    getLiquidationPrice: vi.fn(async () => null),
    getCurrentAutomations:
      currentImpl ??
      vi.fn(async () => ({
        account: BASE_ACCOUNT,
        chain_id: 8453,
        enabled: [],
        inferred_intents: [],
        warnings: [],
        merkl: null,
        read_ok: true,
        ...state,
      })),
  } as unknown as ArcadiaApiClient;
  registerAccountTools(mock.server, api, createMockChains());
  return mock.getHandler("read.account.info");
}

function manager(over: Manager): Manager {
  return { protocol: "", enabled: true, deprecated: false, ...over };
}

describe("read.account.info automation", () => {
  beforeEach(() => {
    gasRelayerEnabled = false;
  });

  it("reports a rebalancer registered on an older asset-manager version as active", async () => {
    const handler = setup({
      enabled: [
        manager({
          manager: "rebalancer",
          protocol: "slipstream_v1",
          address: REBALANCER_V2_1_0_SLIPSTREAM_V1,
        }),
      ],
      inferred_intents: ["rebalance"],
    });
    const result = await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.automation.rebalancer).toBe("slipstream");
    expect(data.automation.compounder).toBe(false);
    expect(data.automation.yield_claimer).toBe(false);
    expect(data.automation.dex_protocol).toBe("slipstream");
    expect(data.automation.inferred_intents).toEqual(["rebalance"]);
  });

  it("maps every backend protocol name to its dex_protocol value", async () => {
    const handler = setup({
      enabled: [
        manager({ manager: "compounder", protocol: "uniswap_v4", address: BASE_ACCOUNT }),
        manager({ manager: "rebalancer", protocol: "slipstream_v3_op", address: BASE_ACCOUNT }),
      ],
    });
    const data = parseToolResponse(await handler({ account_address: BASE_ACCOUNT, chain_id: 10 }));

    expect(data.automation.compounder).toBe("uniV4");
    expect(data.automation.rebalancer).toBe("slipstream_v3");
  });

  it("reports an unrecognised protocol verbatim, not as account-level", async () => {
    const handler = setup({
      enabled: [
        manager({ manager: "rebalancer", protocol: "slipstream_v9", address: BASE_ACCOUNT }),
      ],
    });
    const data = parseToolResponse(
      await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 }),
    );

    expect(data.automation.rebalancer).toBe("slipstream_v9");
    expect(data.automation.dex_protocol).toBeUndefined();
    expect(data.context_notes.join(" ")).toContain("unrecognised protocol");
  });

  it("reports an account-level manager as true rather than a protocol", async () => {
    const handler = setup({
      enabled: [
        manager({
          manager: "cow_swapper",
          address: "0xb988a32DeF54821Dde0D7382e8a74f1BE4da1f23",
        }),
      ],
    });
    const data = parseToolResponse(
      await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 }),
    );

    expect(data.automation.cow_swapper).toBe(true);
    expect(data.automation.dex_protocol).toBeUndefined();
  });

  it("does not count a superseded manager as active, and lists it for cleanup", async () => {
    const handler = setup({
      enabled: [
        manager({
          manager: "cow_swapper",
          address: COW_SWAPPER_OLD,
          deprecated: true,
          version: "1.0",
        }),
      ],
    });
    const data = parseToolResponse(
      await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 }),
    );

    expect(data.automation.cow_swapper).toBe(false);
    expect(data.automation.deprecated_managers).toEqual([
      { manager: "cow_swapper", address: COW_SWAPPER_OLD, version: "1.0" },
    ]);
  });

  it("returns false for every automation slot when nothing is registered", async () => {
    const handler = setup();
    const data = parseToolResponse(
      await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 }),
    );

    expect(data.automation.rebalancer).toBe(false);
    expect(data.automation.compounder).toBe(false);
    expect(data.automation.yield_claimer).toBe(false);
    expect(data.automation.cow_swapper).toBe(false);
    expect(data.automation.merkl_operator).toBe(false);
    expect(data.automation.deprecated_managers).toBeUndefined();
  });

  it("notes an unreliable read instead of reporting an empty automation state", async () => {
    const handler = setup({
      read_ok: false,
      warnings: ["account could not be confirmed on-chain; state is unknown"],
    });
    const data = parseToolResponse(
      await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 }),
    );

    expect(data.context_notes.join(" ")).toContain("could not be confirmed on-chain");
    expect(data.context_notes.join(" ")).toContain("read.asset_manager.current");
  });

  it("reports gas_relayer separately, since no intent configures it", async () => {
    gasRelayerEnabled = true;
    const handler = setup();
    const data = parseToolResponse(
      await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 }),
    );

    expect(data.automation.gas_relayer).toBe(true);
    // It is not an intent-backed manager, so it must not leak into the protocol slots.
    expect(data.automation.rebalancer).toBe(false);
    expect(GAS_RELAYER).toMatch(/^0x/);
  });

  it("reports gas_relayer false when not registered", async () => {
    const handler = setup();
    const data = parseToolResponse(
      await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 }),
    );

    expect(data.automation.gas_relayer).toBe(false);
  });

  it("keeps the rest of the account readable when the automations read fails", async () => {
    const handler = setup(
      {},
      vi.fn(async () => {
        throw new Error("Arcadia API error (503 on /automations): upstream unavailable");
      }),
    );
    const result = await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.automation).toBeUndefined();
    expect(data.overview).not.toBeNull();
    expect(data.context_notes.join(" ")).toContain("Automation state unavailable");
  });
});
