import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { AssetListOutput, AssetPricesOutput } from "../output-schemas.js";

export function registerAssetTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "read.asset.list",
    {
      annotations: {
        title: "List Supported Assets",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "List supported collateral assets on Arcadia. Returns compact list (address, symbol, decimals, type). Use search to filter by symbol substring. For USD prices, use read.asset.prices.",
      inputSchema: {
        search: z
          .string()
          .optional()
          .describe("Filter assets by symbol (case-insensitive substring match)"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: AssetListOutput,
    },
    async ({ search, chain_id }) => {
      try {
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
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
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
    "read.asset.prices",
    {
      annotations: {
        title: "Get Asset Prices",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get USD prices for one or more asset addresses. Pass a single address or comma-separated addresses. Returns a price map keyed by address.",
      inputSchema: {
        asset_addresses: z
          .string()
          .describe("Single address or comma-separated addresses for price lookup"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: AssetPricesOutput,
    },
    async ({ asset_addresses, chain_id }) => {
      try {
        const addresses = asset_addresses.split(",").map((a) => a.trim());
        const result =
          addresses.length === 1
            ? await api.getPrice(chain_id, addresses[0])
            : await api.getPrices(chain_id, addresses);
        const wrapped =
          typeof result === "number"
            ? { prices: { [addresses[0]]: result } }
            : { prices: result as Record<string, number> };
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
}
