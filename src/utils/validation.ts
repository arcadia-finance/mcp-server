import { SUPPORTED_CHAIN_IDS, SUPPORTED_CHAINS_ERROR, type ChainId } from "../config/chains.js";

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
    throw new Error(`Unsupported chain_id: ${chainId}. ${SUPPORTED_CHAINS_ERROR}.`);
  }
  return chainId as ChainId;
}

/** ABI-encoded calldata: 0x plus pairs of hex digits (empty calldata is 0x). */
export function validateHexCalldata(data: string, label = "data"): `0x${string}` {
  const d = data.trim();
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(d)) {
    throw new Error(
      `Invalid ${label}: expected hex calldata starting with 0x and an even number of hex digits after the prefix.`,
    );
  }
  return d as `0x${string}`;
}

/** Wei amount as a decimal string (avoids ambiguous BigInt() on partial hex). */
export function parseWeiDecimalString(s: string, label = "value"): bigint {
  const t = s.trim();
  if (!/^\d+$/.test(t)) {
    throw new Error(
      `Invalid ${label}: expected a non-negative decimal wei string (digits only), e.g. "0" or "1000000000000000000".`,
    );
  }
  return BigInt(t);
}
