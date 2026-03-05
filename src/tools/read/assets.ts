import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerAssetTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "get_assets",
    {
      description:
        "Get supported collateral assets on Arcadia. Returns compact list (address, symbol, decimals, type) by default. Use asset_addresses for USD price lookup. Use search to filter by symbol substring.",
      inputSchema: {
        asset_addresses: z
          .string()
          .optional()
          .describe("Single address or comma-separated addresses for price lookup"),
        search: z
          .string()
          .optional()
          .describe("Filter assets by symbol (case-insensitive substring match)"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ asset_addresses, search, chain_id }) => {
      try {
        if (asset_addresses) {
          const addresses = asset_addresses.split(",").map((a) => a.trim());
          const result =
            addresses.length === 1
              ? await api.getPrice(chain_id, addresses[0])
              : await api.getPrices(chain_id, addresses);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }
        const raw = await api.getAssets(chain_id);
        const obj = raw as Record<string, unknown>;
        const allAssets = (Array.isArray(raw) ? raw : (obj.assets ?? obj.data ?? [])) as Record<
          string,
          unknown
        >[];
        let assets = allAssets.map((a) => ({
          address: a.address ?? a.asset_address,
          symbol: a.name ?? a.symbol ?? a.asset_symbol,
          decimals: a.decimals,
          type: a.standard ?? a.asset_type ?? a.type,
        }));
        if (search) {
          const q = search.toLowerCase();
          assets = assets.filter((a) => ((a.symbol as string) ?? "").toLowerCase().includes(q));
        }
        const result = { total: assets.length, assets };
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
