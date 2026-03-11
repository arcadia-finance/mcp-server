import { z } from "zod";
import type { AmProtocol } from "../../../config/addresses.js";
import type { EncodedIntent } from "./encoding.js";

export type PoolProtocol =
  | "slipstream"
  | "slipstream_v2"
  | "staked_slipstream"
  | "staked_slipstream_v2"
  | "uniV3"
  | "uniV4";

const PROTOCOL_TO_AM_KEY: Record<PoolProtocol, AmProtocol> = {
  slipstream: "slipstreamV1",
  slipstream_v2: "slipstreamV2",
  staked_slipstream: "slipstreamV1",
  staked_slipstream_v2: "slipstreamV2",
  uniV3: "uniV3",
  uniV4: "uniV4",
};

export function poolProtocolToAmKey(protocol: PoolProtocol): AmProtocol {
  return PROTOCOL_TO_AM_KEY[protocol];
}

export const POOL_PROTOCOL_SCHEMA = z
  .enum([
    "slipstream",
    "slipstream_v2",
    "staked_slipstream",
    "staked_slipstream_v2",
    "uniV3",
    "uniV4",
  ])
  .describe(
    "LP protocol — resolves the correct AM address. staked_slipstream variants are aliases for slipstream (same AM contracts).",
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatResult(result: EncodedIntent & Record<string, any>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  };
}
