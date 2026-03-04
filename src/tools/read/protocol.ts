import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerProtocolTools(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "get_protocol_stats",
    "Get Arcadia protocol-wide statistics: total TVL, total borrowed, number of pools, AAA token circulating supply.",
    {
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ chain_id }) => {
      try {
        const [pools_data, aaa_circulating_supply] = await Promise.all([
          api.getPoolsData(chain_id),
          api.getCirculatingSupply(),
        ]);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ pools_data, aaa_circulating_supply }, null, 2),
            },
          ],
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

  server.tool(
    "get_strategies",
    "Get Arcadia LP strategies with APY, underlying assets, and pool info. Returns all strategies, detail for a specific one, or featured only.",
    {
      strategy_id: z.number().optional().describe("Strategy ID for detailed info"),
      featured_only: z.boolean().default(false).describe("Return only featured strategies"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ strategy_id, featured_only, chain_id }) => {
      try {
        let result;
        if (strategy_id !== undefined) {
          result = await api.getStrategyInfo(chain_id, strategy_id);
        } else if (featured_only) {
          result = await api.getFeatured(chain_id);
        } else {
          result = await api.getStrategies(chain_id);
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

  server.tool(
    "get_recommendation",
    "Get a rebalancing recommendation for an Arcadia account \u2014 suggests asset changes to optimize yield.",
    {
      account_address: z.string().describe("Arcadia account address"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ account_address, chain_id }) => {
      try {
        const result = await api.getRecommendation(chain_id, account_address);
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
}
