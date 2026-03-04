import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerPointsTools(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "get_points",
    "Get Arcadia points balance for a wallet, or the points leaderboard if no wallet is specified.",
    {
      wallet_address: z.string().optional().describe("Wallet address for points balance"),
    },
    async ({ wallet_address }) => {
      try {
        const result = wallet_address
          ? await api.getPoints(wallet_address)
          : await api.getPointsLeaderboard();
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
