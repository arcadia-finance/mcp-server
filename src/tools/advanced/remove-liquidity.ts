import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerRemoveLiquidityTool(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "build_remove_liquidity_tx",
    "Build an unsigned transaction to remove/decrease liquidity from an LP position in an Arcadia account.",
    {
      account_address: z.string().describe("Arcadia account address"),
      asset_address: z.string().describe("Position manager contract"),
      asset_id: z.number().describe("NFT token ID"),
      adjustment: z
        .string()
        .describe(
          "Liquidity amount to remove (raw uint128 value as string). Use the position's total liquidity for full removal.",
        ),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ account_address, asset_address, asset_id, adjustment, chain_id }) => {
      try {
        const result = await api.getDecreaseLiquidityCalldata({
          chain_id,
          account_address,
          asset_address,
          asset_id,
          adjustment,
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
