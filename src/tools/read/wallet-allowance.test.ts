import { describe, it, expect, vi } from "vitest";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ADDRESS,
  TEST_ACCOUNT,
} from "../../test-utils.js";
import { registerWalletTools } from "./wallet.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const MAX_UINT256 = 2n ** 256n - 1n;

vi.mock("../../clients/chain.js", () => ({
  getPublicClient: vi.fn(() => ({
    multicall: vi.fn(async () => [
      // USDC: allowance, decimals, symbol
      { status: "success", result: 5000000n },
      { status: "success", result: 6 },
      { status: "success", result: "USDC" },
      // WETH: allowance, decimals, symbol
      { status: "success", result: MAX_UINT256 },
      { status: "success", result: 18 },
      { status: "success", result: "WETH" },
    ]),
  })),
}));

function setup() {
  const mock = createMockServer();
  registerWalletTools(mock.server, createMockChains());
  return mock.getHandler("read.wallet.allowance");
}

describe("read.wallet.allowance", () => {
  it("registers the tool", () => {
    const mock = createMockServer();
    registerWalletTools(mock.server, createMockChains());
    expect(mock.tools.find((t) => t.name === "read.wallet.allowance")).toBeDefined();
  });

  it("returns allowances for multiple tokens", async () => {
    const handler = setup();
    const result = await handler({
      owner_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      token_addresses: [USDC, WETH],
      chain_id: 8453,
    });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.tokens).toHaveLength(2);
    expect(data.tokens[0].symbol).toBe("USDC");
    expect(data.tokens[0].formatted).toBe("5");
    expect(data.tokens[0].is_max_approval).toBe(false);
    expect(data.tokens[1].symbol).toBe("WETH");
    expect(data.tokens[1].is_max_approval).toBe(true);
  });

  it("returns empty tokens array for empty input", async () => {
    const handler = setup();
    const result = await handler({
      owner_address: TEST_ADDRESS,
      spender_address: TEST_ACCOUNT,
      token_addresses: [],
      chain_id: 8453,
    });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.tokens).toHaveLength(0);
  });
});
