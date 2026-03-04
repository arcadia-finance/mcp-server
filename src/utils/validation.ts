import { SUPPORTED_CHAIN_IDS, type ChainId } from "../config/chains.js";

export function isValidAddress(address: string): address is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

export function validateAddress(address: string, label = "address"): `0x${string}` {
  if (!isValidAddress(address)) {
    throw new Error(
      `Invalid ${label}: "${address}". Expected a 0x-prefixed 42-character hex string.`,
    );
  }
  return address;
}

export function validateChainId(chainId: number): ChainId {
  if (!SUPPORTED_CHAIN_IDS.includes(chainId as ChainId)) {
    throw new Error(
      `Unsupported chain_id: ${chainId}. Arcadia is deployed on Base (8453), Optimism (10), and Unichain (130).`,
    );
  }
  return chainId as ChainId;
}
