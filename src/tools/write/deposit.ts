import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { accountAbi } from "../../abis/index.js";

export function registerDepositTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.tool(
    "build_deposit_tx",
    "Build an unsigned transaction to deposit ERC20 tokens into an Arcadia account. Ensure the account is approved to spend your tokens first.",
    {
      account_address: z.string().describe("Arcadia account address"),
      asset_addresses: z.array(z.string()).describe("Token contract addresses to deposit"),
      asset_amounts: z.array(z.string()).describe("Amounts in raw units/wei, one per asset"),
      asset_ids: z.array(z.number()).optional().describe("Token IDs, use 0 for ERC20"),
      chain_id: z.number().default(8453).describe("Chain ID (default: Base 8453)"),
    },
    async (params) => {
      try {
        if (params.asset_addresses.length !== params.asset_amounts.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: asset_addresses and asset_amounts must have the same length.",
              },
            ],
            isError: true,
          };
        }
        const ids = (params.asset_ids ?? params.asset_addresses.map(() => 0)).map((n) => BigInt(n));
        const amounts = params.asset_amounts.map((a) => BigInt(a));

        const data = encodeFunctionData({
          abi: accountAbi,
          functionName: "deposit",
          args: [params.asset_addresses as `0x${string}`[], ids, amounts],
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: "Deposit assets into Arcadia account",
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
