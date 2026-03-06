import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { formatAdvancedResponse } from "./format-response.js";
import { validateAddress } from "../../utils/validation.js";

export function registerRepayWithCollateralTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "build_repay_with_collateral_tx",
    {
      annotations: {
        title: "Build Repay With Collateral Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Multi-step flash-action: swaps account collateral to debt token and repays in one atomic transaction. To repay from wallet instead, use build_repay_tx. NOTE: If you are closing a position (remove LP + swap + repay + withdraw), prefer build_close_position_tx which batches everything atomically. Only use this tool for standalone repayment while keeping the position active. The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Response includes tenderly_sim_url and tenderly_sim_status for pre-broadcast validation.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        amount_in: z.string().describe("Collateral amount to sell"),
        asset_from: z.string().describe("Collateral token to sell"),
        numeraire: z.string().describe("Debt token address"),
        creditor: z.string().describe("Lending pool address"),
        slippage: z.number().optional().default(100).describe("Basis points, 100 = 1%"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, amount_in, asset_from, numeraire, creditor, slippage, chain_id }) => {
      try {
        validateAddress(account_address, "account_address");
        const result = await api.getRepayCalldata({
          amount_in,
          chain_id,
          account_address,
          asset_from,
          numeraire,
          creditor,
          slippage: slippage ?? 100,
        });

        const res = result as Record<string, unknown>;
        if (res.tenderly_sim_status === "false") {
          const simUrl = res.tenderly_sim_url
            ? `\nTenderly simulation: ${res.tenderly_sim_url}`
            : "";
          const simError = res.tenderly_sim_error
            ? `\nRevert reason: ${res.tenderly_sim_error}`
            : "";
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Transaction simulation FAILED — do NOT broadcast.${simError}${simUrl}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(formatAdvancedResponse(res, chain_id), null, 2),
            },
          ],
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
