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

// Robinhood is not in viem/chains either. multicall3 is declared with blockCreated: 0 because it is
// a genesis predeploy at the canonical address there — viem's getChainContractAddress only declines
// to batch below blockCreated, so with the field absent it aggregates at blocks where multicall3
// might have no code.
const robinhood = defineChain({
  id: 4663,
  name: "Robinhood",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11", blockCreated: 0 },
  },
});

const viemChains = {
  8453: base,
  10: optimism,
  130: unichain,
  4663: robinhood,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clients = new Map<ChainId, any>();

export function getPublicClient(chainId: ChainId, chainConfigs: Record<ChainId, ChainConfig>) {
  let client = clients.get(chainId);
  if (!client) {
    const config = chainConfigs[chainId];
    if (!config?.rpcUrl) {
      // Named rather than handing viem an empty transport, which fails later as an opaque
      // network error against a chain the caller never suspects is unconfigured.
      throw new Error(
        `No RPC URL configured for chain ${chainId}. Set RPC_URL_${config?.name?.toUpperCase() ?? chainId}.`,
      );
    }
    client = createPublicClient({
      chain: viemChains[chainId],
      transport: http(config.rpcUrl),
    });
    clients.set(chainId, client);
  }
  return client;
}
