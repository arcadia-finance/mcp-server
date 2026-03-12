import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { PoolListOutput, PoolDetailOutput } from "../output-schemas.js";

export function registerPoolTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "read.pool.list",
    {
      annotations: {
        title: "List Lending Pools",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "List all Arcadia lending pools: TVL, utilization, available liquidity. Key fields: interest_rate = current borrow cost, lending_apy = lender yield. All rates are decimal fractions (1.0 = 100%, 0.06 = 6%). For APY history on a specific pool, use read.pool.info.",
      inputSchema: {
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: PoolListOutput,
    },
    async ({ chain_id }) => {
      try {
        const result = await api.getPools(chain_id);
        if (Array.isArray(result) && result.length === 0) {
          const empty = {
            pools: [] as unknown[],
            note: `No lending pools found on chain ${chain_id}.`,
          };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(empty, null, 2) }],
            structuredContent: empty,
          };
        }
        const wrapped = { pools: Array.isArray(result) ? result : [] };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(wrapped, null, 2) }],
          structuredContent: wrapped,
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
    "read.pool.info",
    {
      annotations: {
        title: "Get Pool Info",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get detailed info for a single lending pool including APY history over time. Useful for analyzing rate trends and comparing pools. Use read.pool.list to discover pool addresses.",
      inputSchema: {
        pool_address: z.string().describe("Pool address"),
        days: z.number().default(14).describe("Number of days of APY history"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: PoolDetailOutput,
    },
    async ({ pool_address, days, chain_id }) => {
      try {
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
        const detail = { pool, apy_history };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(detail, null, 2) }],
          structuredContent: detail,
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
