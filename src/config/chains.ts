// Ethereum (1) is absent deliberately: Arcadia is not deployed on mainnet, so every address a tool
// would read there has no code. It joins when the contracts land.
export const SUPPORTED_CHAIN_IDS = [8453, 130, 10, 4663] as const;
export type ChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export const CHAIN_ID_DESCRIPTION =
  "Chain ID: 8453 (Base), 130 (Unichain), 10 (Optimism), or 4663 (Robinhood)";
export const SUPPORTED_CHAINS_ERROR =
  "Supported chains: Base (8453), Unichain (130), Optimism (10), and Robinhood (4663)";

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
      stateViewer: "0xc18a3169788F4F75A170290584ECA6395C75Ecdb",
    },
    4663: {
      name: "robinhood",
      chainId: 4663,
      // No public endpoint to fall back to, so this is empty when unconfigured rather than a
      // guessed URL. getPublicClient turns that into a named error for Robinhood requests only,
      // which keeps the server booting for everyone who does not use the chain.
      rpcUrl: process.env.RPC_URL_ROBINHOOD ?? "",
      stateViewer: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
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
