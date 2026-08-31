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
  slipstreamV3AM: "0xcaf4167dE878Cfb23D9912b1ff5869F2b3527189",
  wrappedAeroAM: "0x17B5826382e3a5257b829cF0546A08Bd77409270",
  stakedAeroAM: "0x9f42361B7602Df1A8Ae28Bf63E6cb1883CD44C27",
  stakedSlipstreamAM: "0x1Dc7A0f5336F52724B650E39174cfcbbEdD67bF1",
  stakedSlipstreamV2AM: "0xBed6C3E35B9B1e044b3Bc71465769EdFDC0FDD4c",
  stakedSlipstreamV3AM: "0xE0F20BE5886F11CbcD2cb5bA9987Bcbbf1d8ca7b",
  wrappedStakedSlipstreamV3: "0x9189BC25f8faC157B4D87b0b3c14F56bA1477d53",
  alienBaseAM: "0x79dD8b8d4abB5dEEA986DB1BF0a02E4CA42ae416",
  gaugeHelper: "0x2feb44C740eB4e64aDE33E0D44Ef30049Fb06CC5",
  clHelper: "0x1496Bd3502DE0Dd5b1D44E16623cCc5118771117",
} as const;

interface TokenInfo {
  address: string;
  decimals: number;
}

type PoolMap = { LP_WETH: string; LP_USDC: string; LP_CBBTC?: string };
export const POOLS: Partial<Record<ChainId, PoolMap>> = {
  8453: {
    LP_WETH: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",
    LP_USDC: "0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1",
    LP_CBBTC: "0xa37E9b4369dc20940009030BfbC2088F09645e3B",
  },
  10: {
    LP_WETH: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",
    LP_USDC: "0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1",
  },
};

type TrancheMap = { sr_WETH: string; sr_USDC: string; sr_CBBTC?: string };
export const TRANCHES: Partial<Record<ChainId, TrancheMap>> = {
  8453: {
    sr_WETH: "0x393893caeB06B5C16728bb1E354b6c36942b1382",
    sr_USDC: "0xEFE32813dBA3A783059d50e5358b9e3661218daD",
    sr_CBBTC: "0x9c63A4c499B323a25D389Da759c2ac1e385eEc92",
  },
  10: {
    sr_WETH: "0x393893caeB06B5C16728bb1E354b6c36942b1382",
    sr_USDC: "0xEFE32813dBA3A783059d50e5358b9e3661218daD",
  },
};

export const TOKENS: Partial<Record<ChainId, Record<string, TokenInfo>>> = {
  8453: {
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    cbBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", decimals: 8 },
    AERO: { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18 },
    AAA: { address: "0xaaa843fb2916c0B57454270418E121C626402AAa", decimals: 18 },
    stAAA: { address: "0xDeA1531d8a1505785eb517C7A28526443df223F3", decimals: 18 },
  },
  10: {
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    USDC: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    OP: { address: "0x4200000000000000000000000000000000000042", decimals: 18 },
    VELO: { address: "0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db", decimals: 18 },
    WBTC: { address: "0x68f180fcCe6836688e9084f035309E29Bf0A2095", decimals: 8 },
    WSTETH: { address: "0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb", decimals: 18 },
  },
};

// Asset-manager addresses are NOT duplicated here. The automations backend owns
// the address book (current + superseded deployments, per chain and protocol) and
// returns finished setAssetManagers calldata, so the only mapping the MCP server
// needs is between the backend's protocol vocabulary and the dex_protocol values
// the read tools report.

/** Asset-manager groups the automations reader can report on an account. */
export const AUTOMATION_GROUPS = [
  "rebalancer",
  "compounder",
  "yield_claimer",
  "cow_swapper",
  "merkl_operator",
] as const;

// The gas relayer pulls deposited AAA to pay for rebalances beyond the free
// quota. It is registered as an asset manager but is not part of the automations
// address book (no intent configures it), so it is not in the backend's reader
// and stays here. Same address on every supported chain.
export const GAS_RELAYER = "0xD938C8d04cF91094fecAF0A2018EAac483a40137" as const;

const BACKEND_PROTOCOL_TO_DEX_PROTOCOL: Record<string, string> = {
  slipstream_v1: "slipstream",
  slipstream_v2: "slipstream_v2",
  slipstream_v3: "slipstream_v3",
  slipstream_v3_op: "slipstream_v3",
  uniswap_v3: "uniV3",
  uniswap_v4: "uniV4",
};

/**
 * Backend protocol name to the dex_protocol value the read tools use.
 * Returns null for an unrecognised name so callers can surface it rather than
 * silently reporting a wrong protocol.
 */
export function backendProtocolToDexProtocol(protocol: string): string | null {
  return BACKEND_PROTOCOL_TO_DEX_PROTOCOL[protocol] ?? null;
}

// Chain-specific addresses
export const STATE_VIEWERS: Partial<Record<ChainId, `0x${string}`>> = {
  8453: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71",
  130: "0x86e8631A016F9068C3f085fAF484Ee3F5fDee8f2",
  10: "0xc18a3169788F4F75A170290584ECA6395C75Ecdb",
  4663: "0xF3334192D15450CdD385c8B70e03f9A6bD9E673b",
};

// LP position manager address (lowercase) → dex_protocol value
// Chain-specific: non-staked LP position manager addresses differ per chain
export const CHAIN_POSITION_MANAGERS: Partial<Record<ChainId, Record<string, string>>> = {
  8453: {
    "0x827922686190790b37229fd06084350e74485b72": "slipstream",
    "0xa990c6a764b73bf43cee5bb40339c3322fb9d55f": "slipstream_v2",
    "0xe1f8cd9ac4e4a65f54f38a5cdafca44f6dd68b53": "slipstream_v3",
    "0x03a520b32c04bf3beef7beb72e919cf822ed34f1": "uniV3",
    "0x7c5f5a4bbd8fd63184577525326123b519429bdc": "uniV4",
  },
  130: {
    "0x991d5546c4b442b4c5fdc4c8b8b8d131deb24702": "slipstream",
    "0x943e6e07a7e8e791dafc44083e54041d743c46e9": "uniV3",
    "0x4529a01c7a0410167c5740c487a8de60232617bf": "uniV4",
  },
  10: {
    "0x416b433906b1b72fa758e166e239c43d68dc6f29": "slipstream", // Velodrome Slipstream V1
    "0xf7f8ccce99ca2896ec75d3a399d152db96808399": "slipstream_v3",
    "0xc36442b4a4522e871399cd717abdd847ab11fe88": "uniV3",
    "0x3c3ea4b57a46241e54610e5f022e5c45859a1017": "uniV4",
  },
  // Uniswap only. Aerodrome, Velodrome and Slipstream have no deployment on Robinhood, so there is
  // no position manager for them to name.
  4663: {
    "0x73991a25c818bf1f1128deaab1492d45638de0d3": "uniV3",
    "0x58daec3116aae6d93017baaea7749052e8a04fa7": "uniV4",
  },
};

// Staked / wrapped-staked position managers. V1 and V2 are deployed at the same
// address on every chain; the V3 pair was deployed at different addresses on
// Optimism, so those are chain-scoped and take precedence over the shared table.
export const UNIVERSAL_POSITION_MANAGERS: Record<string, string> = {
  "0x1dc7a0f5336f52724b650e39174cfcbbedd67bf1": "staked_slipstream", // StakedSlipstreamAM V1
  "0xbed6c3e35b9b1e044b3bc71465769edfdc0fdd4c": "staked_slipstream_v2", // StakedSlipstreamAM V2
  "0xe0f20be5886f11cbcd2cb5ba9987bcbbf1d8ca7b": "staked_slipstream_v3", // StakedSlipstreamAM V3
  "0xd74339e0f10fce96894916b93e5cc7de89c98272": "staked_slipstream", // WrappedStakedSlipstream V1
  "0x147a2ccbaf4521ad209a2875ae0b3c496f4b25a4": "staked_slipstream_v2", // WrappedStakedSlipstream V2
  "0x9189bc25f8fac157b4d87b0b3c14f56ba1477d53": "staked_slipstream_v3", // WrappedStakedSlipstream V3
};

export const CHAIN_STAKED_POSITION_MANAGERS: Partial<Record<ChainId, Record<string, string>>> = {
  10: {
    "0xf6a87d944204bb5fdb9cf5534c03c46895f78ecd": "staked_slipstream_v3", // StakedSlipstreamAM V3 (OP)
    "0xc4d3d804ed64c1f78097799208d46b1db4252749": "staked_slipstream_v3", // WrappedStakedSlipstream V3 (OP)
  },
};

/** dex_protocol for an LP position manager address on a chain, or null if unknown. */
export function positionManagerToDexProtocol(chainId: ChainId, address: string): string | null {
  const key = address.toLowerCase();
  return (
    CHAIN_STAKED_POSITION_MANAGERS[chainId]?.[key] ??
    UNIVERSAL_POSITION_MANAGERS[key] ??
    CHAIN_POSITION_MANAGERS[chainId]?.[key] ??
    null
  );
}
