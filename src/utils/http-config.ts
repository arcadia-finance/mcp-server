import type { Express } from "express";

/**
 * Listen port from PORT env. Throws at startup so a bad PORT does not silently break binding.
 */
export function parseListenPort(raw: string | undefined): number {
  const n = parseInt(raw ?? "3000", 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw new Error(`Invalid PORT: "${raw ?? ""}". Expected an integer from 1 to 65535.`);
  }
  return n;
}

/**
 * Max requests per minute from RATE_LIMIT_RPM. Misconfiguration must not collapse to NaN/max 0/max Infinity.
 */
export function parseRateLimitRpm(raw: string | undefined): number {
  const n = parseInt(raw ?? "60", 10);
  if (!Number.isFinite(n) || n < 1) {
    console.warn(`Invalid RATE_LIMIT_RPM "${raw ?? ""}", using default 60`);
    return 60;
  }
  return Math.min(n, 1_000_000);
}

/**
 * Enables Express req.ip when behind proxies (Ingress, CDN). See https://expressjs.com/guide/behind-proxies.html
 * TRUST_PROXY: "1", "true", or a hop count ("2").
 */
export function applyTrustProxyFromEnv(app: Express, raw: string | undefined): void {
  const hops = parseTrustProxyHopCount(raw);
  if (hops === undefined) return;
  app.set("trust proxy", hops);
}

export function parseTrustProxyHopCount(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const t = raw.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes") return 1;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 32) {
    console.warn(
      `Invalid TRUST_PROXY "${raw.trim()}". Expected 1–32 hops or true/1/yes. Rate limits will use socket IP only.`,
    );
    return undefined;
  }
  return n;
}
