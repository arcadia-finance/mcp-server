import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { formatBatchedResponse } from "./format-response.js";
import { validateAddress } from "../../../utils/validation.js";
import { BatchedTransactionOutput } from "../../output-schemas.js";

export function registerStakeTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write.account.stake",
    {
      annotations: {
        title: "Build Position Action Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: BatchedTransactionOutput,
      description:
        "Flash-action: stake, unstake, or claim rewards for an LP position in one atomic transaction. Use the `action` parameter to select the operation. `asset_address` is the position manager contract — pass the non-staked PM address when staking, or the staked PM address when unstaking. The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Tenderly simulation may not be available for this endpoint — verify the position exists with read.account.info before signing.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        action: z.enum(["stake", "unstake", "claim"]).describe("Action to perform"),
        asset_address: z.string().describe("Position manager contract address"),
        asset_id: z.number().describe("NFT token ID of the LP position"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, action, asset_address, asset_id, chain_id }) => {
      try {
        validateAddress(account_address, "account_address");
        validateAddress(asset_address, "asset_address");
        if (action === "claim") {
          const result = await api.getClaimCalldata({
            chain_id,
            account_address,
            asset_address,
            asset_id,
          });

          const claimRes = result as Record<string, unknown>;
          if (claimRes.tenderly_sim_status === "false") {
            const simUrl = claimRes.tenderly_sim_url
              ? `\nTenderly simulation: ${claimRes.tenderly_sim_url}`
              : "";
            const simError = claimRes.tenderly_sim_error
              ? `\nRevert reason: ${claimRes.tenderly_sim_error}`
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

          const claimResponse = formatBatchedResponse(claimRes, chain_id, "Claim staking rewards");
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(claimResponse, null, 2),
              },
            ],
            structuredContent: claimResponse,
          };
        }

        const result = await api.getStakeCalldata({
          chain_id,
          account_address,
          asset_address,
          asset_id,
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

        const response = formatBatchedResponse(res, chain_id, "Stake LP position");
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
        const msg = err instanceof Error ? err.message : String(err);
        const hint =
          msg.includes("500") || msg.includes("Web3")
            ? " This usually means the position (asset_id) does not exist in the account. Verify with read.account.info first."
            : "";
        return {
          content: [{ type: "text" as const, text: `Error: ${msg}${hint}` }],
          isError: true,
        };
      }
    },
  );
}
