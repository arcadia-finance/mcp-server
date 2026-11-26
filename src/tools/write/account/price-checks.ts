import { z } from "zod";
import { TOKENS } from "../../../config/addresses.js";
import type { ChainId } from "../../../config/chains.js";
import type { PriceCheck } from "../../../types/api.js";

function formatUsd(value: number): string {
  const digits =
    Math.abs(value) >= 1 ? { maximumFractionDigits: 2 } : { maximumSignificantDigits: 4 };
  return `${value.toLocaleString("en-US", digits)} USD`;
}

export function tokenSymbolMap(chainId: ChainId): Map<string, string> {
  const symbols = new Map<string, string>();
  for (const [symbol, info] of Object.entries(TOKENS[chainId] ?? {})) {
    symbols.set(info.address.toLowerCase(), symbol);
  }
  return symbols;
}

export function describePriceCheck(check: PriceCheck, tokenSymbols: Map<string, string>): string {
  const name = (addr: string) => tokenSymbols.get(addr.toLowerCase()) ?? addr;
  if (check.status === "off_market") {
    if (typeof check.deviation_bps !== "number") {
      throw new Error(
        `Malformed price check for pool ${check.pool}: off_market without deviation_bps.`,
      );
    }
    const pct = Math.abs(check.deviation_bps) / 100;
    return `Pool ${check.pool} (${name(check.token0)}/${name(check.token1)}): pool price is ${pct}% off market.`;
  }
  if (!check.unpriced_token_name) {
    throw new Error(
      `Malformed price check for pool ${check.pool}: unpriced without unpriced_token_name.`,
    );
  }
  const parts = [
    `Pool ${check.pool} (${name(check.token0)}/${name(check.token1)}): no price information for ${check.unpriced_token_name}, so the pool price cannot be verified.`,
  ];
  if (check.implied_usd_price != null) {
    parts.push(`The pool implies a price of ${formatUsd(check.implied_usd_price)}.`);
  }
  if (check.swap_spend_usd != null) {
    parts.push(`The position swaps about ${formatUsd(check.swap_spend_usd)} at that price.`);
  }
  return parts.join(" ");
}

export const PriceCheckAcknowledgement = z.discriminatedUnion("status", [
  z.object({
    pool: z.string(),
    status: z.literal("off_market"),
    deviation_bps: z.number(),
    unpriced_token: z.null(),
  }),
  z.object({
    pool: z.string(),
    status: z.literal("unpriced"),
    deviation_bps: z.null(),
    unpriced_token: z.string(),
  }),
]);

export type PriceCheckAcknowledgement = z.infer<typeof PriceCheckAcknowledgement>;

export function acknowledgementFor(check: PriceCheck): PriceCheckAcknowledgement {
  if (check.status === "off_market") {
    if (typeof check.deviation_bps !== "number") {
      throw new Error(
        `Malformed price check for pool ${check.pool}: off_market without deviation_bps.`,
      );
    }
    return {
      pool: check.pool,
      status: "off_market",
      deviation_bps: check.deviation_bps,
      unpriced_token: null,
    };
  }
  if (!check.unpriced_token) {
    throw new Error(
      `Malformed price check for pool ${check.pool}: unpriced without unpriced_token.`,
    );
  }
  return {
    pool: check.pool,
    status: "unpriced",
    deviation_bps: null,
    unpriced_token: check.unpriced_token,
  };
}

export function isCovered(
  flagged: PriceCheckAcknowledgement,
  accepted: PriceCheckAcknowledgement[],
): boolean {
  return accepted.some((a) => {
    if (a.pool.toLowerCase() !== flagged.pool.toLowerCase()) return false;
    if (a.status === "off_market" && flagged.status === "off_market") {
      return Math.abs(flagged.deviation_bps) <= Math.abs(a.deviation_bps);
    }
    if (a.status === "unpriced" && flagged.status === "unpriced") {
      return a.unpriced_token.toLowerCase() === flagged.unpriced_token.toLowerCase();
    }
    return false;
  });
}
