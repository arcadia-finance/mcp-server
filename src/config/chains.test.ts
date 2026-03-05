import { describe, it, expect, afterEach } from "vitest";
import { resolveChainId, getChainConfigs } from "./chains.js";

describe("resolveChainId", () => {
  it.each([8453, 10, 130])("accepts numeric chain ID %d", (id) => {
    expect(resolveChainId(id)).toBe(id);
  });

  it("accepts string chain ID", () => {
    expect(resolveChainId("8453")).toBe(8453);
  });

  it("throws for unsupported numeric chain ID", () => {
    expect(() => resolveChainId(1)).toThrow("Unsupported chain ID: 1");
  });

  it("throws for NaN string", () => {
    expect(() => resolveChainId("abc")).toThrow("Unsupported chain ID: NaN");
  });
});

describe("getChainConfigs", () => {
  const saved = {
    RPC_URL_BASE: process.env.RPC_URL_BASE,
    RPC_URL_OPTIMISM: process.env.RPC_URL_OPTIMISM,
    RPC_URL_UNICHAIN: process.env.RPC_URL_UNICHAIN,
  };

  afterEach(() => {
    for (const [key, val] of Object.entries(saved)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
  });

  it("uses public RPCs when no env vars set", () => {
    delete process.env.RPC_URL_BASE;
    delete process.env.RPC_URL_OPTIMISM;
    delete process.env.RPC_URL_UNICHAIN;
    const configs = getChainConfigs();
    expect(configs[8453].rpcUrl).toBe("https://mainnet.base.org");
    expect(configs[10].rpcUrl).toBe("https://mainnet.optimism.io");
    expect(configs[130].rpcUrl).toBe("https://mainnet.unichain.org");
  });

  it("uses RPC_URL_BASE when set", () => {
    process.env.RPC_URL_BASE = "https://custom-base-rpc.example.com";
    const configs = getChainConfigs();
    expect(configs[8453].rpcUrl).toBe("https://custom-base-rpc.example.com");
  });

  it("uses RPC_URL_OPTIMISM when set", () => {
    process.env.RPC_URL_OPTIMISM = "https://custom-op-rpc.example.com";
    const configs = getChainConfigs();
    expect(configs[10].rpcUrl).toBe("https://custom-op-rpc.example.com");
  });

  it("uses RPC_URL_UNICHAIN when set", () => {
    process.env.RPC_URL_UNICHAIN = "https://custom-uni-rpc.example.com";
    const configs = getChainConfigs();
    expect(configs[130].rpcUrl).toBe("https://custom-uni-rpc.example.com");
  });
});
