import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerStrategyTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "read.strategy.list",
    {
      annotations: {
        title: "Get Strategies",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get Arcadia LP strategies. Use featured_only=true for curated top strategies (recommended first call). Use strategy_id for full detail on a specific strategy — includes APY per range width (narrower range = higher APY but more rebalancing cost/risk). Without filters, returns a compact summary with 7d avg APY for the strategy's default range. Increase limit or use offset for pagination. All APY values are decimal fractions (1.0 = 100%, 0.05 = 5%).",
      inputSchema: {
        strategy_id: z.number().optional().describe("Strategy ID for full detail"),
        featured_only: z
          .boolean()
          .default(false)
          .describe("Return only featured/curated strategies (recommended)"),
        limit: z
          .number()
          .default(25)
          .describe("Max strategies to return in compact list (default 25)"),
        offset: z.number().default(0).describe("Skip first N strategies for pagination"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ strategy_id, featured_only, limit, offset, chain_id }) => {
      try {
        let result;
        if (strategy_id !== undefined) {
          result = await api.getStrategyInfo(chain_id, strategy_id);
        } else if (featured_only) {
          result = await api.getFeatured(chain_id);
        } else {
          const all = await api.getStrategies(chain_id);
          const list = Array.isArray(all) ? all : (all as Record<string, unknown>).data;
          if (Array.isArray(list)) {
            const total = list.length;
            const effectiveOffset = offset ?? 0;
            const effectiveLimit = limit ?? 25;
            const page = (list as Record<string, unknown>[]).slice(
              effectiveOffset,
              effectiveOffset + effectiveLimit,
            );
            result = {
              total,
              offset: effectiveOffset,
              limit: effectiveLimit,
              strategies: page.map((s) => ({
                strategy_id: s.strategy_id,
                name: s.strategy_name,
                strategy_apy_7d: s.strategy_apy,
                tvl: s.tvl,
                underlyings: (s.underlyings as Record<string, unknown>[] | undefined)?.map((u) => ({
                  address: u.underlying_address,
                  symbol: u.underlying_symbol,
                })),
                max_leverage: s.max_leverage,
              })),
            };
          } else {
            result = all;
          }
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "read.strategy.recommendation",
    {
      annotations: {
        title: "Get Recommendation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get a rebalancing recommendation for an Arcadia account — suggests asset changes to optimize yield. Uses 1d APY (not 7d like read.strategy.list), so recommended strategies may differ from the list ranking.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, chain_id }) => {
      try {
        const result = await api.getRecommendation(chain_id, account_address);
        const rec = result as Record<string, unknown>;
        if (
          Array.isArray(rec.added_assets) &&
          rec.added_assets.length === 0 &&
          Array.isArray(rec.removed_assets) &&
          rec.removed_assets.length === 0 &&
          Number(rec.current_apy ?? 0) === 0 &&
          Number(rec.proposed_apy ?? 0) === 0
        ) {
          rec.context_note =
            "Account has no active positions — no rebalancing recommendations available.";
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(rec, null, 2) }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
