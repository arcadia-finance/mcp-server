import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerRepayWithCollateralTool(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "build_repay_with_collateral_tx",
    "Build an unsigned transaction to repay debt by selling account collateral. Swaps collateral to debt token and repays in one flash action.",
    {
      account_address: z.string().describe("Arcadia account address"),
      amount_in: z.string().describe("Collateral amount to sell"),
      asset_from: z.string().describe("Collateral token to sell"),
      numeraire: z.string().describe("Debt token address"),
      creditor: z.string().describe("Lending pool address"),
      slippage: z.number().optional().default(100).describe("Basis points, 100 = 1%"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ account_address, amount_in, asset_from, numeraire, creditor, slippage, chain_id }) => {
      try {
        const result = await api.getRepayCalldata({
          amount_in,
          chain_id,
          account_address,
          asset_from,
          numeraire,
          creditor,
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
