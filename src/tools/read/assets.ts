import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerAssetTools(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "get_assets",
    "Get supported collateral assets on Arcadia with addresses, types, and decimals. Optionally get USD prices by providing asset addresses.",
    {
      asset_addresses: z
        .string()
        .optional()
        .describe("Single address or comma-separated addresses for price lookup"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ asset_addresses, chain_id }) => {
      try {
        if (asset_addresses) {
          const addresses = asset_addresses.split(",").map((a) => a.trim());
          const result =
            addresses.length === 1
              ? await api.getPrice(chain_id, addresses[0])
              : await api.getPrices(chain_id, addresses);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }
        const result = await api.getAssets(chain_id);
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
