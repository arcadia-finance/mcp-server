import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const MAX_UINT256 = 2n ** 256n - 1n;

export function registerApproveTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.tool(
    "build_approve_tx",
    "Build an unsigned ERC20 approval transaction. Required before depositing tokens into an Arcadia account — the account contract must be approved to pull tokens from your wallet. Use amount 'max_uint256' for unlimited approval.",
    {
      token_address: z.string().describe("ERC20 token contract address to approve"),
      spender_address: z
        .string()
        .describe("Address being approved — use the Arcadia account address for deposits"),
      amount: z
        .string()
        .default("max_uint256")
        .describe("Amount in raw units, or 'max_uint256' for unlimited approval"),
      chain_id: z.number().default(8453).describe("Chain ID (default: Base 8453)"),
    },
    async (params) => {
      try {
        const amount =
          !params.amount || params.amount === "max_uint256" ? MAX_UINT256 : BigInt(params.amount);

        const data = encodeFunctionData({
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [params.spender_address as `0x${string}`, amount],
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: `Approve ${params.spender_address} to spend ${params.token_address}`,
                  transaction: {
                    to: params.token_address as `0x${string}`,
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
