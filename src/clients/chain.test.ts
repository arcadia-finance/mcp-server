import { describe, it, expect, vi } from "vitest";
import { getAddress } from "viem";
import { getPublicClient } from "./chain.js";
import {
  SUPPORTED_CHAIN_IDS,
  getChainConfigs,
  type ChainConfig,
  type ChainId,
} from "../config/chains.js";
import { STATE_VIEWERS, CHAIN_POSITION_MANAGERS } from "../config/addresses.js";

/**
 * A supported chain that viem cannot build a client for is a chain every tool fails on at runtime
 * while the config looks complete. Robinhood is not in viem/chains, so it only works if the local
 * `defineChain` covers it — and nothing else in the codebase would notice if it did not.
 */
describe("getPublicClient", () => {
  it("builds a client for every supported chain", () => {
    const configs = getChainConfigs();
    for (const id of SUPPORTED_CHAIN_IDS) {
      const withRpc: Record<ChainId, ChainConfig> = {
        ...configs,
        [id]: { ...configs[id], rpcUrl: "https://rpc.example.com" },
      };
      const client = getPublicClient(id, withRpc);
      expect(client, `no client for chain ${id}`).toBeDefined();
      expect(client.chain.id, `client for ${id} has the wrong chain`).toBe(id);
    }
  });

  it("names the missing variable instead of handing viem an empty transport", async () => {
    // getPublicClient memoises per chain id, and the test above populates that cache, so the
    // guard is only reachable through a freshly loaded module.
    vi.resetModules();
    const fresh = await import("./chain.js");
    const configs = getChainConfigs();
    const unconfigured: Record<ChainId, ChainConfig> = {
      ...configs,
      4663: { ...configs[4663], rpcUrl: "" },
    };

    expect(() => fresh.getPublicClient(4663, unconfigured)).toThrow(/Set RPC_URL_ROBINHOOD/);
  });
});

describe("Robinhood chain wiring", () => {
  it("has a state viewer", () => {
    expect(STATE_VIEWERS[4663]).toBe("0xF3334192D15450CdD385c8B70e03f9A6bD9E673b");
  });

  it("maps only Uniswap position managers, since it has no Slipstream deployment", () => {
    expect(Object.values(CHAIN_POSITION_MANAGERS[4663] ?? {}).sort()).toEqual(["uniV3", "uniV4"]);
  });

  it("keys the position managers lowercase, matching the map's lookup convention", () => {
    const keys = Object.keys(CHAIN_POSITION_MANAGERS[4663] ?? {});
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});

describe("state viewers", () => {
  it("are EIP-55 checksummed on every chain that has one", () => {
    // A wrong checksum is accepted by viem's getAddress but rejected by isAddress(strict), so it
    // survives unnoticed until something validates and then fails on one chain only.
    const entries = Object.entries(STATE_VIEWERS);
    expect(entries.length).toBe(SUPPORTED_CHAIN_IDS.length);
    for (const [id, address] of entries) {
      expect(address, `chain ${id} state viewer is not checksummed`).toBe(
        getAddress(address as string),
      );
    }
  });
});
