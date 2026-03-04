import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerSwapTool(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "build_swap_tx",
    "Build an unsigned transaction to swap assets within an Arcadia account. The backend finds the optimal swap route.",
    {
      account_address: z.string().describe("Arcadia account address"),
      asset_from: z.string().describe("Token address to swap from"),
      asset_to: z.string().describe("Token address to swap to"),
      amount_in: z.string().describe("Raw units"),
      slippage: z.number().optional().default(100).describe("Basis points, 100 = 1%"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ account_address, asset_from, asset_to, amount_in, slippage, chain_id }) => {
      try {
        const result = await api.getSwapCalldata({
          amount_in,
          chain_id,
          account_address,
          asset_from,
          asset_to,
          slippage: slippage ?? 100,
        });
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
