import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { formatBatchedResponse } from "./format-response.js";
import { validateAddress } from "../../../utils/validation.js";

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
      description:
        "Flash-action: stake, unstake, or claim rewards for an LP position in one atomic transaction. The stake/unstake direction is auto-detected from asset_address: pass the non-staked position manager to stake, or the staked position manager to unstake. The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up).",
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

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(formatBatchedResponse(claimRes, chain_id), null, 2),
              },
            ],
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
