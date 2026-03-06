import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { formatAdvancedResponse } from "./format-response.js";
import { validateAddress } from "../../utils/validation.js";

export function registerSwapTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "advanced.swap",
    {
      annotations: {
        title: "Build Swap Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Flash-action: swaps assets within an Arcadia account in one atomic transaction. The backend finds the optimal swap route. NOTE: If you are closing a position (swap + repay + withdraw), prefer advanced.close_position which batches everything atomically. Only use this tool for standalone swaps within an active position. The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Response includes tenderly_sim_url and tenderly_sim_status for pre-broadcast validation.",
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
