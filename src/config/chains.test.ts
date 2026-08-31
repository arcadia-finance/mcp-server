import { describe, it, expect, afterEach } from "vitest";
import { resolveChainId, getChainConfigs, SUPPORTED_CHAIN_IDS } from "./chains.js";

describe("resolveChainId", () => {
  it.each([8453, 130, 10, 4663])("accepts numeric chain ID %d", (id) => {
    expect(resolveChainId(id)).toBe(id);
  });

  it("accepts string chain ID", () => {
    expect(resolveChainId("8453")).toBe(8453);
  });

  it("throws for unsupported numeric chain ID", () => {
    // Ethereum is deliberately unsupported: Arcadia is not deployed on mainnet.
    expect(() => resolveChainId(1)).toThrow("Unsupported chain_id: 1");
  });

  it("throws for NaN string", () => {
    expect(() => resolveChainId("abc")).toThrow("Unsupported chain_id: NaN");
  });
});

describe("getChainConfigs", () => {
  const saved = {
    RPC_URL_BASE: process.env.RPC_URL_BASE,
    RPC_URL_UNICHAIN: process.env.RPC_URL_UNICHAIN,
    RPC_URL_OPTIMISM: process.env.RPC_URL_OPTIMISM,
    RPC_URL_ROBINHOOD: process.env.RPC_URL_ROBINHOOD,
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
    delete process.env.RPC_URL_UNICHAIN;
    delete process.env.RPC_URL_OPTIMISM;
    const configs = getChainConfigs();
    expect(configs[8453].rpcUrl).toBe("https://mainnet.base.org");
    expect(configs[130].rpcUrl).toBe("https://mainnet.unichain.org");
    expect(configs[10].rpcUrl).toBe("https://mainnet.optimism.io");
  });

  it("leaves Robinhood's RPC empty rather than guessing, since it has no public endpoint", () => {
    delete process.env.RPC_URL_ROBINHOOD;
    expect(getChainConfigs()[4663].rpcUrl).toBe("");
  });

  it("uses RPC_URL_ROBINHOOD when set", () => {
    process.env.RPC_URL_ROBINHOOD = "https://custom-rh-rpc.example.com";
    expect(getChainConfigs()[4663].rpcUrl).toBe("https://custom-rh-rpc.example.com");
  });

  it("gives every supported chain a config with a state viewer", () => {
    const configs = getChainConfigs();
    for (const id of SUPPORTED_CHAIN_IDS) {
      expect(configs[id], `chain ${id} has no config`).toBeDefined();
      expect(configs[id].chainId).toBe(id);
      expect(configs[id].stateViewer, `chain ${id} has no state viewer`).toBeTruthy();
    }
  });

  it("uses RPC_URL_BASE when set", () => {
    process.env.RPC_URL_BASE = "https://custom-base-rpc.example.com";
    const configs = getChainConfigs();
    expect(configs[8453].rpcUrl).toBe("https://custom-base-rpc.example.com");
  });

  it("uses RPC_URL_UNICHAIN when set", () => {
    process.env.RPC_URL_UNICHAIN = "https://custom-uni-rpc.example.com";
    const configs = getChainConfigs();
    expect(configs[130].rpcUrl).toBe("https://custom-uni-rpc.example.com");
  });

  it("uses RPC_URL_OPTIMISM when set", () => {
    process.env.RPC_URL_OPTIMISM = "https://custom-op-rpc.example.com";
    const configs = getChainConfigs();
    expect(configs[10].rpcUrl).toBe("https://custom-op-rpc.example.com");
  });
});
