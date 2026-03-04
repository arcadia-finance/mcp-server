import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerPositionActionsTool(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "build_position_action_tx",
    "Build an unsigned transaction to stake, unstake, or claim rewards for an LP position. The stake/unstake direction is auto-detected from asset_address: pass the non-staked position manager to stake, or the staked position manager to unstake.",
    {
      account_address: z.string().describe("Arcadia account address"),
      action: z.enum(["stake", "unstake", "claim"]).describe("Action to perform"),
      asset_address: z.string().describe("Position manager contract address"),
      asset_id: z.number().describe("NFT token ID of the LP position"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ account_address, action, asset_address, asset_id, chain_id }) => {
      try {
        if (action === "claim") {
          const result = await api.getClaimCalldata({
            chain_id,
            account_address,
            asset_address,
            asset_id,
          });
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }

        const result = await api.getStakeCalldata({
          chain_id,
          account_address,
          asset_address,
          asset_id,
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
