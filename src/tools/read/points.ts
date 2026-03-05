import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerPointsTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "get_points",
    {
      description:
        "Get Arcadia points balance for a wallet, or the points leaderboard (paginated) if no wallet is specified.",
      inputSchema: {
        wallet_address: z.string().optional().describe("Wallet address for points balance"),
        limit: z
          .number()
          .default(25)
          .describe(
            "Max leaderboard entries to return (default 25, ignored when wallet_address is provided)",
          ),
        offset: z.number().default(0).describe("Skip first N leaderboard entries for pagination"),
      },
    },
    async ({ wallet_address, limit, offset }) => {
      try {
        if (wallet_address) {
          const result = await api.getPoints(wallet_address);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }
        const all = await api.getPointsLeaderboard();
        const list = Array.isArray(all)
          ? all
          : ((all as Record<string, unknown>).data as unknown[]);
        if (Array.isArray(list)) {
          const page = list.slice(offset, offset + limit);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { total: list.length, offset, limit, leaderboard: page },
                  null,
                  2,
                ),
              },
            ],
          };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(all, null, 2) }] };
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
