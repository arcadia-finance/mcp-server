import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { formatBatchedResponse } from "./format-response.js";
import { validateAddress } from "../../../utils/validation.js";
import { BatchedTransactionOutput } from "../../output-schemas.js";

export function registerSwapTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write.account.swap",
    {
      annotations: {
        title: "Build Swap Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: BatchedTransactionOutput,
      description:
        "Flash-action: swaps assets within an Arcadia account in one atomic transaction. The backend finds the optimal swap route. NOTE: If you are closing a position (swap + repay + withdraw), prefer write.account.close which batches everything atomically. Only use this tool for standalone swaps within an active position. The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Response includes tenderly_sim_url and tenderly_sim_status for pre-broadcast validation — if tenderly_sim_status is 'false', do NOT broadcast the transaction.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        asset_from: z.string().describe("Token address to swap from"),
        asset_to: z.string().describe("Token address to swap to"),
        amount_in: z.string().describe("Raw units"),
        slippage: z.number().optional().default(100).describe("Basis points, 100 = 1%"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, asset_from, asset_to, amount_in, slippage, chain_id }) => {
      try {
        validateAddress(account_address, "account_address");
        validateAddress(asset_from, "asset_from");
        validateAddress(asset_to, "asset_to");
        const result = await api.getSwapCalldata({
          amount_in,
          chain_id,
          account_address,
          asset_from,
          asset_to,
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

        const response = formatBatchedResponse(res, chain_id, "Swap tokens in account");
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
