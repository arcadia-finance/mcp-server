export const SUPPORTED_CHAIN_IDS = [8453, 130, 10] as const;
export type ChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export const CHAIN_ID_DESCRIPTION = "Chain ID: 8453 (Base), 130 (Unichain), or 10 (Optimism)";
export const SUPPORTED_CHAINS_ERROR =
  "Supported chains: Base (8453), Unichain (130), and Optimism (10)";

export interface ChainConfig {
  name: string;
  chainId: ChainId;
  rpcUrl: string;
  stateViewer: `0x${string}` | null;
}

export function getChainConfigs(): Record<ChainId, ChainConfig> {
  return {
    8453: {
      name: "base",
      chainId: 8453,
      rpcUrl: process.env.RPC_URL_BASE ?? "https://mainnet.base.org",
      stateViewer: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71",
    },
    130: {
      name: "unichain",
      chainId: 130,
      rpcUrl: process.env.RPC_URL_UNICHAIN ?? "https://mainnet.unichain.org",
      stateViewer: "0x86e8631A016F9068C3f085fAF484Ee3F5fDee8f2",
    },
    10: {
      name: "optimism",
      chainId: 10,
      rpcUrl: process.env.RPC_URL_OPTIMISM ?? "https://mainnet.optimism.io",
      stateViewer: "0xc18a3169788F4f75A170290584ecA6395C75Ecdb",
    },
  };
}

export function resolveChainId(input: number | string): ChainId {
  const id = typeof input === "string" ? parseInt(input, 10) : input;
  if (!SUPPORTED_CHAIN_IDS.includes(id as ChainId)) {
    throw new Error(`Unsupported chain_id: ${id}. ${SUPPORTED_CHAINS_ERROR}.`);
  }
  return id as ChainId;
}
