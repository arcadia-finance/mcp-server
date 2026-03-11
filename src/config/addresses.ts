import type { ChainId } from "./chains.js";

// Protocol contracts — same addresses on all chains
export const PROTOCOL = {
  factory: "0xDa14Fdd72345c4d2511357214c5B89A919768e59",
  registry: "0xd0690557600eb8Be8391D1d97346e2aab5300d5f",
  liquidator: "0xA4B0b9fD1d91fA2De44F6ABFd59cC14bA1E1a7Af",
  accountV1: "0xbea2B6d45ACaF62385877D835970a0788719cAe1",
  actionMulticall: "0xa48D4201030C09CEA82f5B0955b9C837699D3c32",
  chainlinkOM: "0x6a5485E3ce6913890ae5e8bDc08a868D432eEB31",
  standardERC20AM: "0xfBecEaFC96ed6fc800753d3eE6782b6F9a60Eed7",
  uniswapV3AM: "0x21bd524cC54CA78A7c48254d4676184f781667dC",
  uniswapV4AM: "0xb808971ea73341b0d7286B3D67F08De321f80465",
  slipstreamAM: "0xd3A7055bBcDA4F8F49e5c5dE7E83B09a33633F44",
  slipstreamV2AM: "0x3aDE1F1FdC666B1bFAd376345EA878D1c11EB73B",
  wrappedAeroAM: "0x17B5826382e3a5257b829cF0546A08Bd77409270",
  stakedAeroAM: "0x9f42361B7602Df1A8Ae28Bf63E6cb1883CD44C27",
  stakedSlipstreamAM: "0x1Dc7A0f5336F52724B650E39174cfcbbEdD67bF1",
  stakedSlipstreamV2AM: "0xBed6C3E35B9B1e044b3Bc71465769EdFDC0FDD4c",
  alienBaseAM: "0x79dD8b8d4abB5dEEA986DB1BF0a02E4CA42ae416",
  gaugeHelper: "0x2feb44C740eB4e64aDE33E0D44Ef30049Fb06CC5",
  clHelper: "0x1496Bd3502DE0Dd5b1D44E16623cCc5118771117",
} as const;

interface TokenInfo {
  address: string;
  decimals: number;
}

export const POOLS: Partial<
  Record<
    ChainId,
    {
      LP_WETH: string;
      LP_USDC: string;
      LP_CBBTC: string;
    }
  >
> = {
  8453: {
    LP_WETH: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",
    LP_USDC: "0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1",
    LP_CBBTC: "0xa37E9b4369dc20940009030BfbC2088F09645e3B",
  },
};

export const TRANCHES: Partial<
  Record<
    ChainId,
    {
      sr_WETH: string;
      sr_USDC: string;
      sr_CBBTC: string;
    }
  >
> = {
  8453: {
    sr_WETH: "0x393893caeB06B5C16728bb1E354b6c36942b1382",
    sr_USDC: "0xEFE32813dBA3A783059d50e5358b9e3661218daD",
    sr_CBBTC: "0x9c63A4c499B323a25D389Da759c2ac1e385eEc92",
  },
};

export const TOKENS: Partial<
  Record<
    ChainId,
    {
      WETH: TokenInfo;
      USDC: TokenInfo;
      cbBTC: TokenInfo;
      AERO: TokenInfo;
      AAA: TokenInfo;
      stAAA: TokenInfo;
    }
  >
> = {
  8453: {
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    cbBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
    AERO: { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18 },
    AAA: { address: "0xaaa843fb2916c0B57454270418E121C626402AAa", decimals: 18 },
    stAAA: { address: "0xDeA1531d8a1505785eb517C7A28526443df223F3", decimals: 18 },
  },
};

// Asset manager protocol keys (protocol-specific AMs: rebalancer, compounder, yield claimer)
export type AmProtocol = "slipstreamV1" | "slipstreamV2" | "uniV3" | "uniV4";

// Standalone AM keys (protocol-agnostic)
export type StandaloneAm = "merklOperator" | "gasRelayer" | "cowSwapper";

export type AmCategory = "rebalancers" | "compounders" | "yieldClaimers";

// Single source of truth — all addresses, no chain dimension
const AM_ADDRESSES = {
  rebalancers: {
    slipstreamV1: "0x5802454749cc0c4A6F28D5001B4cD84432e2b79F",
    slipstreamV2: "0x953Ff365d0b562ceC658dc46B394E9282338d9Ea",
    uniV3: "0xbA1D0c99c261F94b9C8b52465890Cca27dd993Bd",
    uniV4: "0x01EDaF0067a10D18c88D2876c0A85Ee0096a5Ac0",
  },
  compounders: {
    slipstreamV1: "0x467837f44A71e3eAB90AEcfC995c84DC6B3cfCF7",
    slipstreamV2: "0x35e59448C7145482E56212510cC689612AB4F61f",
    uniV3: "0x02e1fa043214E51eDf1F0478c6D0d3D5658a2DC3",
    uniV4: "0xAA95c9c402b195D8690eCaea2341a76e3266B189",
  },
  yieldClaimers: {
    slipstreamV1: "0x5a8278D37b7a787574b6Aa7E18d8C02D994f18Ba",
    slipstreamV2: "0xc8bF4B2c740FF665864E9494832520f18822871C",
    uniV3: "0x75Ed28EA8601Ce9F5FbcAB1c2428f04A57aFaA16",
    uniV4: "0xD8aa21AB7f9B8601CB7d7A776D3AFA1602d5D8D4",
  },
  merklOperator: "0x969F0251360b9Cf11c68f6Ce9587924c1B8b42C6",
  gasRelayer: "0xD938C8d04cF91094fecAF0A2018EAac483a40137",
  cowSwapper: "0xc928013A219EC9F18dE7B2dee6A50Ba626811854",
} as const;

// Per-chain availability — update these when deploying to new chains
const CHAIN_PROTOCOLS: Record<ChainId, ReadonlySet<AmProtocol>> = {
  8453: new Set(["slipstreamV1", "slipstreamV2", "uniV3", "uniV4"]),
  130: new Set(["slipstreamV1", "uniV3", "uniV4"]),
};

const CHAIN_STANDALONE_AMS: Record<ChainId, ReadonlySet<StandaloneAm>> = {
  8453: new Set(["merklOperator", "gasRelayer", "cowSwapper"]),
  130: new Set(["merklOperator", "gasRelayer"]),
};

const CHAIN_NAMES: Record<ChainId, string> = { 8453: "Base", 130: "Unichain" };

// Map internal keys to user-facing pool_protocol values for error messages
const AM_KEY_TO_POOL_PROTOCOL: Record<AmProtocol, string> = {
  slipstreamV1: "slipstream",
  slipstreamV2: "slipstream_v2",
  uniV3: "uniV3",
  uniV4: "uniV4",
};

export function getAmProtocolAddress(
  chainId: ChainId,
  category: AmCategory,
  protocol: AmProtocol,
): string {
  if (!CHAIN_PROTOCOLS[chainId].has(protocol)) {
    const available = [...CHAIN_PROTOCOLS[chainId]]
      .map((k) => AM_KEY_TO_POOL_PROTOCOL[k])
      .join(", ");
    throw new Error(
      `${AM_KEY_TO_POOL_PROTOCOL[protocol]} is not available on ${CHAIN_NAMES[chainId]} (${chainId}). Available protocols: ${available}.`,
    );
  }
  return AM_ADDRESSES[category][protocol];
}

const STANDALONE_TO_USER_FACING: Record<StandaloneAm, string> = {
  merklOperator: "merkl_operator",
  gasRelayer: "gas_relayer",
  cowSwapper: "cow_swapper",
};

// Standalone AMs that have corresponding intent tools (exclude internal-only ones from error messages)
const INTENT_STANDALONE_AMS: ReadonlySet<StandaloneAm> = new Set(["merklOperator", "cowSwapper"]);

export function getStandaloneAmAddress(chainId: ChainId, am: StandaloneAm): string {
  if (!CHAIN_STANDALONE_AMS[chainId].has(am)) {
    const available = [...CHAIN_STANDALONE_AMS[chainId]]
      .filter((a) => INTENT_STANDALONE_AMS.has(a))
      .map((a) => STANDALONE_TO_USER_FACING[a])
      .join(", ");
    throw new Error(
      `${STANDALONE_TO_USER_FACING[am]} is not available on ${CHAIN_NAMES[chainId]} (${chainId}). Available: ${available}.`,
    );
  }
  return AM_ADDRESSES[am];
}

export interface AmCheck {
  group: string;
  protocol: string | null;
  address: string;
}

const CATEGORY_TO_GROUP: Record<AmCategory, string> = {
  rebalancers: "rebalancer",
  compounders: "compounder",
  yieldClaimers: "yield_claimer",
};

const STANDALONE_TO_GROUP: Record<StandaloneAm, string> = {
  merklOperator: "merkl_operator",
  gasRelayer: "gas_relayer",
  cowSwapper: "cow_swapper",
};

export function getChainAmChecks(chainId: ChainId): AmCheck[] {
  const protocols = CHAIN_PROTOCOLS[chainId];
  const standalone = CHAIN_STANDALONE_AMS[chainId];
  const checks: AmCheck[] = [];

  for (const category of ["rebalancers", "compounders", "yieldClaimers"] as const) {
    for (const protocol of protocols) {
      checks.push({
        group: CATEGORY_TO_GROUP[category],
        protocol,
        address: AM_ADDRESSES[category][protocol],
      });
    }
  }

  for (const am of standalone) {
    checks.push({
      group: STANDALONE_TO_GROUP[am],
      protocol: null,
      address: AM_ADDRESSES[am],
    });
  }

  return checks;
}

// Minimal strategy hook — required for rebalancer onSetAssetManager callback
export const MINIMAL_STRATEGY_HOOK = "0x13beD1A58d87c0454872656c5328103aAe5eB86A" as const;

// Chain-specific addresses
export const STATE_VIEWERS: Partial<Record<ChainId, `0x${string}`>> = {
  8453: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71",
  130: "0x86e8631A016F9068C3f085fAF484Ee3F5fDee8f2",
};
