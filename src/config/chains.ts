export const SUPPORTED_CHAIN_IDS = [8453, 10, 130] as const;
export type ChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export interface ChainConfig {
  name: string;
  chainId: ChainId;
  rpcUrl: string;
  stateViewer: `0x${string}` | null;
}

export function getChainConfigs(): Record<ChainId, ChainConfig> {
  const alchemyKey = process.env.ALCHEMY_API_KEY;

  return {
    8453: {
      name: "base",
      chainId: 8453,
      rpcUrl: alchemyKey
        ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : "https://mainnet.base.org",
      stateViewer: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71",
    },
    10: {
      name: "optimism",
      chainId: 10,
      rpcUrl: alchemyKey
        ? `https://opt-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : "https://mainnet.optimism.io",
      stateViewer: null, // TBD — Optimism deployment pending
    },
    130: {
      name: "unichain",
      chainId: 130,
      rpcUrl: alchemyKey
        ? `https://unichain-mainnet.g.alchemy.com/v2/${alchemyKey}`
        : "https://mainnet.unichain.org",
      stateViewer: "0x86e8631A016F9068C3f085fAF484Ee3F5fDee8f2",
    },
  };
}

export function resolveChainId(input: number | string): ChainId {
  const id = typeof input === "string" ? parseInt(input, 10) : input;
  if (!SUPPORTED_CHAIN_IDS.includes(id as ChainId)) {
    throw new Error(
      `Unsupported chain ID: ${id}. Arcadia is deployed on Base (8453), Optimism (10), and Unichain (130).`,
    );
  }
  return id as ChainId;
}
