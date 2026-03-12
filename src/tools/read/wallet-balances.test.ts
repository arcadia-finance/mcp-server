import { describe, it, expect, vi } from "vitest";
import {
  createMockServer,
  createMockChains,
  parseToolResponse,
  TEST_ADDRESS,
} from "../../test-utils.js";
import { registerWalletTools } from "./wallet.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";

vi.mock("../../clients/chain.js", () => ({
  getPublicClient: vi.fn(() => ({
    getBalance: vi.fn(async () => 1000000000000000000n), // 1 ETH
    multicall: vi.fn(async () => [
      // USDC: balanceOf, decimals, symbol
      { status: "success", result: 5000000n },
      { status: "success", result: 6 },
      { status: "success", result: "USDC" },
      // WETH: balanceOf, decimals, symbol
      { status: "success", result: 500000000000000000n },
      { status: "success", result: 18 },
      { status: "success", result: "WETH" },
    ]),
  })),
}));

function setup() {
  const mock = createMockServer();
  registerWalletTools(mock.server, createMockChains(), {} as ArcadiaApiClient);
  return mock.getHandler("read.wallet.balances");
}

describe("read.wallet.balances", () => {
  it("returns native ETH and token balances", async () => {
    const handler = setup();
    const result = await handler({
      wallet_address: TEST_ADDRESS,
      token_addresses: [USDC, WETH],
      chain_id: 8453,
    });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.native.symbol).toBe("ETH");
    expect(data.native.formatted).toBe("1");
    expect(data.tokens).toHaveLength(2);
    expect(data.tokens[0].symbol).toBe("USDC");
    expect(data.tokens[0].formatted).toBe("5");
    expect(data.tokens[1].symbol).toBe("WETH");
    expect(data.tokens[1].formatted).toBe("0.5");
  });

  it("returns native ETH with empty token list", async () => {
    const handler = setup();
    const result = await handler({
      wallet_address: TEST_ADDRESS,
      token_addresses: [],
      chain_id: 8453,
    });

    expect(result.isError).toBeUndefined();
    const data = parseToolResponse(result);
    expect(data.native.symbol).toBe("ETH");
    expect(data.tokens).toHaveLength(0);
  });
});
