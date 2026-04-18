import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { CHAIN_ID_DESCRIPTION } from "../../config/chains.js";
import {
  StrategyListOutput,
  StrategyDetailOutput,
  StrategyRecommendationOutput,
} from "../output-schemas.js";

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
        "Get Arcadia LP strategies. Use featured_only=true for curated top strategies (recommended first call). Returns a paginated list with 7d avg APY for each strategy's default range. Increase limit or use offset for pagination. All APY values are decimal fractions (1.0 = 100%, 0.05 = 5%). For full detail on a specific strategy (APY per range width), use read.strategy.info.",
      inputSchema: {
        featured_only: z
          .boolean()
          .default(false)
          .describe("Return only featured/curated strategies (recommended)"),
        limit: z.number().default(25).describe("Max strategies to return (default 25)"),
        offset: z.number().default(0).describe("Skip first N strategies for pagination"),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      },
      outputSchema: StrategyListOutput,
    },
    async ({ featured_only, limit, offset, chain_id }) => {
      try {
        let strategies: Record<string, unknown>[];
        let total: number;

        if (featured_only) {
          const raw = await api.getFeatured(chain_id);
          const all = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
          // The /featured endpoint currently returns curated Base strategies regardless of
          // chain_id. Filter by the chain baked into each strategy's url (`/farm/<chainId>/…`)
          // so we never hand back strategies that belong to a different chain.
          const urlChainRe = /\/farm\/(\d+)\//;
          strategies = all.filter((s) => {
            const url = s.url as string | undefined;
            if (!url) return true;
            const match = url.match(urlChainRe);
            if (!match) return true;
            return Number(match[1]) === chain_id;
          });
          total = strategies.length;
          const result: Record<string, unknown> = {
            total,
            offset: 0,
            limit: total,
            strategies,
          };
          if (total === 0 && all.length > 0) {
            result.context_note = `Featured strategies are not curated for chain ${chain_id} yet. Backend returned ${all.length} Base strategies; filtered out. Use featured_only=false to list all strategies on this chain.`;
          }
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          };
        }

        const all = await api.getStrategies(chain_id);
        const list = Array.isArray(all) ? all : (all as Record<string, unknown>).data;
        if (Array.isArray(list)) {
          total = list.length;
          const effectiveOffset = offset ?? 0;
          const effectiveLimit = limit ?? 25;
          const page = (list as Record<string, unknown>[]).slice(
            effectiveOffset,
            effectiveOffset + effectiveLimit,
          );
          strategies = page.map((s) => ({
            strategy_id: s.strategy_id,
            name: s.strategy_name,
            strategy_apy_7d: s.strategy_apy,
            tvl: s.tvl,
            underlyings: (s.underlyings as Record<string, unknown>[] | undefined)?.map((u) => ({
              address: u.underlying_address,
              symbol: u.underlying_symbol,
            })),
            max_leverage: s.max_leverage,
          }));
          const result = {
            total,
            offset: effectiveOffset,
            limit: effectiveLimit,
            strategies,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          };
        }
        const fallback = { total: 0, offset: 0, limit, strategies: [] };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(fallback, null, 2) }],
          structuredContent: fallback,
        };
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
    "read.strategy.info",
    {
      annotations: {
        title: "Get Strategy Info",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get full detail for a specific LP strategy by ID — includes APY per range width (narrower range = higher APY but more rebalancing cost/risk), pool info, and configuration. Use read.strategy.list to discover strategy IDs. All APY values are decimal fractions (1.0 = 100%, 0.05 = 5%).",
      inputSchema: {
        strategy_id: z.number().describe("Strategy ID"),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      },
      outputSchema: StrategyDetailOutput,
    },
    async ({ strategy_id, chain_id }) => {
      try {
        const result = await api.getStrategyInfo(chain_id, strategy_id);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
        };
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
        "Get a rebalancing recommendation for an Arcadia account — suggests asset changes to optimize yield. Uses 1d APY (not 7d like read.strategy.list), so recommended strategies may differ from the list ranking. APY values are decimal fractions (0.05 = 5%). weekly_earning_difference is in USD.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      },
      outputSchema: StrategyRecommendationOutput,
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
        return {
          content: [{ type: "text" as const, text: JSON.stringify(rec, null, 2) }],
          structuredContent: rec,
        };
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
