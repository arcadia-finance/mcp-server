import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { formatBatchedResponse } from "./format-response.js";
import { validateAddress } from "../../../utils/validation.js";

export function registerRemoveLiquidityTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write.account.remove_liquidity",
    {
      annotations: {
        title: "Build Remove Liquidity Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description: `Flash-action: PARTIALLY decreases liquidity from an LP position. The position remains open with reduced liquidity; underlying tokens stay in the account.

For FULL position exit (burn LP + swap + repay + withdraw), use write.account.close instead — it batches everything into one atomic transaction.

The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Response includes tenderly_sim_url and tenderly_sim_status for pre-broadcast validation.`,
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        asset_address: z.string().describe("Position manager contract"),
        asset_id: z.number().describe("NFT token ID"),
        adjustment: z
          .string()
          .describe(
            "Liquidity amount to remove (raw uint128 value as string). Must be less than total liquidity — for full removal use write.account.close.",
          ),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, asset_address, asset_id, adjustment, chain_id }) => {
      try {
        validateAddress(account_address, "account_address");
        validateAddress(asset_address, "asset_address");
        const result = await api.getDecreaseLiquidityCalldata({
          chain_id,
          account_address,
          asset_address,
          asset_id,
          adjustment,
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
              text: JSON.stringify(formatBatchedResponse(res, chain_id), null, 2),
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
