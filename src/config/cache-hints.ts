import type { ServerOptions } from "@modelcontextprotocol/server";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const staticPublic = { ttlMs: FIVE_MINUTES_MS, cacheScope: "public" } as const;

export const CACHE_HINTS: NonNullable<ServerOptions["cacheHints"]> = {
  "server/discover": staticPublic,
  "tools/list": staticPublic,
  "prompts/list": staticPublic,
  "resources/list": staticPublic,
  "resources/templates/list": staticPublic,
  "resources/read": staticPublic,
};
