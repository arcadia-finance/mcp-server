import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { PointsLeaderboardOutput } from "../output-schemas.js";

export function registerPointsTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "read.point_leaderboard",
    {
      annotations: {
        title: "Get Points Leaderboard",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get the Arcadia points leaderboard (paginated). For a specific wallet's points balance, use read.wallet.points.",
      inputSchema: {
        limit: z.number().default(25).describe("Max leaderboard entries to return (default 25)"),
        offset: z.number().default(0).describe("Skip first N leaderboard entries for pagination"),
      },
      outputSchema: PointsLeaderboardOutput,
    },
    async ({ limit, offset }) => {
      try {
        const all = await api.getPointsLeaderboard();
        const list = Array.isArray(all)
          ? all
          : ((all as Record<string, unknown>).data as unknown[]);
        if (Array.isArray(list)) {
          const page = list.slice(offset, offset + limit);
          const result = { total: list.length, offset, limit, leaderboard: page };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(all, null, 2) }],
          structuredContent: all as unknown as Record<string, unknown>,
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
