import { createPublicClient, http, defineChain } from "viem";
import { base, optimism } from "viem/chains";
import type { ChainId, ChainConfig } from "../config/chains.js";

const unichain = defineChain({
  id: 130,
  name: "Unichain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://mainnet.unichain.org"] },
  },
});

const viemChains = {
  8453: base,
  10: optimism,
  130: unichain,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clients = new Map<ChainId, any>();

export function getPublicClient(chainId: ChainId, chainConfigs: Record<ChainId, ChainConfig>) {
  let client = clients.get(chainId);
  if (!client) {
    const config = chainConfigs[chainId];
    client = createPublicClient({
      chain: viemChains[chainId],
      transport: http(config.rpcUrl),
    });
    clients.set(chainId, client);
  }
  return client;
}
