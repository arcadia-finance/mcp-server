import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerPoolTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "get_lending_pools",
    {
      description:
        "Get Arcadia lending pool data: TVL, utilization, available liquidity. Key fields: interest_rate = current borrow cost, lending_apy = lender yield. All rates are decimal fractions (1.0 = 100%, 0.06 = 6%). Returns all pools, or a single pool with APY history if pool_address is provided.",
      inputSchema: {
        pool_address: z
          .string()
          .optional()
          .describe("Pool address for detailed info with APY history"),
        days: z.number().default(14).describe("Number of days of APY history"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ pool_address, days, chain_id }) => {
      try {
        if (pool_address) {
          const [allPools, apy_history] = await Promise.all([
            api.getPools(chain_id),
            api.getPoolApyHistory(chain_id, pool_address, days),
          ]);
          const poolList = Array.isArray(allPools)
            ? allPools
            : ((allPools as Record<string, unknown>).data as unknown[]);
          const pool = Array.isArray(poolList)
            ? (poolList as Record<string, unknown>[]).find(
                (p) =>
                  ((p.address ?? p.pool_address) as string)?.toLowerCase() ===
                  pool_address.toLowerCase(),
              )
            : null;
          if (!pool) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Pool ${pool_address} not found on chain ${chain_id}.`,
                },
              ],
              isError: true,
            };
          }
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
