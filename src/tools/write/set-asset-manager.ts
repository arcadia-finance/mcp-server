import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { accountAbi } from "../../abis/index.js";

export function registerSetAssetManagerTool(
  server: McpServer,
  _chains: Record<ChainId, ChainConfig>,
) {
  server.tool(
    "build_set_asset_manager_tx",
    "Build an unsigned transaction to grant or revoke an asset manager contract's permission to act on an Arcadia account. Asset managers are contracts that automate position management (rebalancers, compounders, yield claimers, Merkl operators, CoW swappers). See the clamm-liquidity skill for known addresses.",
    {
      account_address: z.string().describe("Arcadia account address"),
      asset_manager_address: z
        .string()
        .describe("Asset manager contract address to grant or revoke"),
      enabled: z.boolean().describe("True to grant permission, false to revoke"),
      chain_id: z.number().default(8453).describe("Chain ID (default: Base 8453)"),
    },
    async (params) => {
      try {
        const data = encodeFunctionData({
          abi: accountAbi,
          functionName: "setAssetManager",
          args: [params.asset_manager_address as `0x${string}`, params.enabled],
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: `${params.enabled ? "Grant" : "Revoke"} asset manager permission for ${params.asset_manager_address}`,
                  transaction: {
                    to: params.account_address as `0x${string}`,
                    data,
                    value: "0",
                    chainId: params.chain_id,
                  },
                },
                null,
                2,
              ),
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
