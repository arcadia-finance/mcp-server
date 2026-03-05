import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerPoolTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "get_lending_pools",
    {
      description:
        "Get Arcadia lending pool data: TVL, supply/borrow APY, utilization, available liquidity. Returns all pools, or a single pool with APY history if pool_address is provided.",
      inputSchema: {
        pool_address: z
          .string()
          .optional()
          .describe("Pool address for detailed info with APY history"),
        days: z.number().default(14).describe("Number of days of APY history"),
        chain_id: z
          .number()
          .default(8453)
          .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
      },
    },
    async ({ pool_address, days, chain_id }) => {
      try {
        if (pool_address) {
          const [pool, apy_history] = await Promise.all([
            api.getPoolsData(chain_id, pool_address),
            api.getPoolApyHistory(chain_id, pool_address, days),
          ]);
          return {
            content: [
              { type: "text" as const, text: JSON.stringify({ pool, apy_history }, null, 2) },
            ],
          };
        }
        const result = await api.getPools(chain_id);
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
