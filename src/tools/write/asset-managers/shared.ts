import { z } from "zod";
import type { AmProtocol } from "../../../config/addresses.js";

export type DexProtocol =
  | "slipstream"
  | "slipstream_v2"
  | "staked_slipstream"
  | "staked_slipstream_v2"
  | "uniV3"
  | "uniV4";

const PROTOCOL_TO_AM_KEY: Record<DexProtocol, AmProtocol> = {
  slipstream: "slipstreamV1",
  slipstream_v2: "slipstreamV2",
  staked_slipstream: "slipstreamV1",
  staked_slipstream_v2: "slipstreamV2",
  uniV3: "uniV3",
  uniV4: "uniV4",
};

export function dexProtocolToAmKey(protocol: DexProtocol): AmProtocol {
  return PROTOCOL_TO_AM_KEY[protocol];
}

export const DEX_PROTOCOL_SCHEMA = z
  .enum([
    "slipstream",
    "slipstream_v2",
    "staked_slipstream",
    "staked_slipstream_v2",
    "uniV3",
    "uniV4",
  ])
  .describe("DEX protocol of the LP position — used to resolve the correct asset manager address.");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatResult(result: Record<string, any>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}
