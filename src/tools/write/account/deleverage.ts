import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { formatBatchedResponse } from "./format-response.js";
import { validateAddress } from "../../../utils/validation.js";
import { BatchedTransactionOutput } from "../../output-schemas.js";

export function registerDeleverageTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write.account.deleverage",
    {
      annotations: {
        title: "Build Deleverage Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: BatchedTransactionOutput,
      description:
        "Multi-step flash-action: sells account collateral to the debt token and repays in one atomic transaction — no wallet tokens needed. To repay from wallet tokens instead, use write.account.repay. NOTE: If you are closing a position (remove LP + swap + repay + withdraw), prefer write.account.close which batches everything atomically. Only use this tool for standalone repayment while keeping the position active. The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Response includes tenderly_sim_url and tenderly_sim_status for pre-broadcast validation — if tenderly_sim_status is 'false', do NOT broadcast the transaction.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        amount_in: z.string().describe("Collateral amount to sell (raw units)"),
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
        validateAddress(asset_from, "asset_from");
        validateAddress(numeraire, "numeraire");
        validateAddress(creditor, "creditor");
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

        const response = formatBatchedResponse(res, chain_id, "Deleverage account position");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
          structuredContent: response,
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
