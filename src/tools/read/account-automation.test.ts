import { describe, it, expect, vi } from "vitest";
import { createMockServer, createMockChains, parseToolResponse } from "../../test-utils.js";
import { registerAccountTools } from "./account.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

// Real account on Base that registered through the dapp on V2.1.0 split
// architecture. MCP used to hardcode V2.1.1 addresses only and returned
// automation.rebalancer = false for these accounts.
const BASE_ACCOUNT = "0x75983c3e2FE16A61fbcE9B4d353E1CB7addB8FC5";
const OWNER = "0x000000000000000000000000000000000000beef";

// V2.1.0 slipstreamV1 rebalancer on Base (see Arcadia.sol REBALANCERS_V2_1_0).
const REBALANCER_V2_1_0_SLIPSTREAM_V1 = "0xE07A9383AF8E0B1320419dFeF205bb9bA75f3Ef2";
// V2.1.1 slipstreamV1 rebalancer (current on all chains).
const REBALANCER_V2_1_1_SLIPSTREAM_V1 = "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F";

// Current CowSwapper V1 address on Base (see Arcadia.sol COW_SWAPPERS).
const COW_SWAPPER_CURRENT = "0xFfC742E68D41389BE9Ef1aFD518F036064DA2Bb6";
// Deprecated CowSwapper V1.0 address on Base — ~1 holdout account still registered here.
const COW_SWAPPER_OLD = "0xc928013A219EC9F18dE7B2dee6A50Ba626811854";

type McArgs = { contracts: Array<{ args: [string, string] }> };

const multicallMock = vi.fn();

vi.mock("../../clients/chain.js", () => ({
  getPublicClient: vi.fn(() => ({
    readContract: vi.fn(async () => 2n),
    multicall: multicallMock,
  })),
}));

function setup() {
  const mock = createMockServer();
  const api = {
    getAccountOverview: vi.fn(async () => ({ owner: OWNER, health_factor: 1, total_open_debt: 0 })),
    getLiquidationPrice: vi.fn(async () => null),
  } as unknown as ArcadiaApiClient;
  registerAccountTools(mock.server, api, createMockChains());
  return mock.getHandler("read.account.info");
}

describe("read.account.info automation", () => {
  it("reports rebalancer active on Base when registered on V2.1.0 (not V2.1.1)", async () => {
    multicallMock.mockImplementationOnce(async ({ contracts }: McArgs) =>
      contracts.map((c) => ({
        status: "success",
        result: c.args[1].toLowerCase() === REBALANCER_V2_1_0_SLIPSTREAM_V1.toLowerCase(),
      })),
    );

    const handler = setup();
    const result = await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.automation.rebalancer).toBe("slipstream");
    expect(data.automation.compounder).toBe(false);
    expect(data.automation.yield_claimer).toBe(false);
  });

  it("reports rebalancer active on Optimism when registered on V2.1.1", async () => {
    multicallMock.mockImplementationOnce(async ({ contracts }: McArgs) =>
      contracts.map((c) => ({
        status: "success",
        result: c.args[1].toLowerCase() === REBALANCER_V2_1_1_SLIPSTREAM_V1.toLowerCase(),
      })),
    );

    const handler = setup();
    const result = await handler({ account_address: BASE_ACCOUNT, chain_id: 10 });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.automation.rebalancer).toBe("slipstream");
  });

  it("reports cow_swapper=true on Base when registered on the current CowSwapper", async () => {
    multicallMock.mockImplementationOnce(async ({ contracts }: McArgs) =>
      contracts.map((c) => ({
        status: "success",
        result: c.args[1].toLowerCase() === COW_SWAPPER_CURRENT.toLowerCase(),
      })),
    );

    const handler = setup();
    const result = await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.automation.cow_swapper).toBe(true);
  });

  it("reports cow_swapper=false on Base when registered only on the deprecated CowSwapper V1.0", async () => {
    multicallMock.mockImplementationOnce(async ({ contracts }: McArgs) =>
      contracts.map((c) => ({
        status: "success",
        result: c.args[1].toLowerCase() === COW_SWAPPER_OLD.toLowerCase(),
      })),
    );

    const handler = setup();
    const result = await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.automation.cow_swapper).toBe(false);
  });

  it("returns false for every automation slot when no AM is registered", async () => {
    multicallMock.mockImplementationOnce(async ({ contracts }: McArgs) =>
      contracts.map(() => ({ status: "success", result: false })),
    );

    const handler = setup();
    const result = await handler({ account_address: BASE_ACCOUNT, chain_id: 8453 });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.automation.rebalancer).toBe(false);
    expect(data.automation.compounder).toBe(false);
    expect(data.automation.yield_claimer).toBe(false);
  });
});
