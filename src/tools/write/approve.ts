import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { erc20Abi, nftmanagerAbi } from "../../abis/index.js";
import { appendDataSuffix } from "../../utils/attribution.js";
import { validateAddress } from "../../utils/validation.js";

const MAX_UINT256 = 2n ** 256n - 1n;

export function registerApproveTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "build_approve_tx",
    {
      annotations: {
        title: "Build Approve Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Build an unsigned approval transaction. For ERC20 tokens: generates approve(spender, amount). For ERC721/ERC1155 NFTs (e.g. LP positions): generates setApprovalForAll(operator, true). Required before build_deposit_tx or build_add_liquidity_tx (when depositing from wallet). Tip: call get_allowance first to check if approval already exists — skip this if the current allowance is sufficient.",
      inputSchema: {
        token_address: z.string().describe("Token contract address to approve"),
        spender_address: z
          .string()
          .describe("Address being approved — use the Arcadia account address for deposits"),
        asset_type: z
          .enum(["erc20", "erc721", "erc1155"])
          .default("erc20")
          .describe(
            "Token type: 'erc20' (default) for fungible tokens, 'erc721' or 'erc1155' for NFTs (LP positions)",
          ),
        amount: z
          .string()
          .default("max_uint256")
          .describe(
            "ERC20 only: amount in raw units, or 'max_uint256' for unlimited. Ignored for NFTs.",
          ),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validToken = validateAddress(params.token_address, "token_address");
        const validSpender = validateAddress(params.spender_address, "spender_address");

        let data: `0x${string}`;
        let description: string;

        if (params.asset_type === "erc721" || params.asset_type === "erc1155") {
          data = encodeFunctionData({
            abi: nftmanagerAbi,
            functionName: "setApprovalForAll",
            args: [validSpender, true],
          });
          description = `Approve ${params.spender_address} to transfer all ${params.asset_type.toUpperCase()} tokens from ${params.token_address}`;
        } else {
          const amount =
            !params.amount || params.amount === "max_uint256" ? MAX_UINT256 : BigInt(params.amount);
          data = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [validSpender, amount],
          });
          description = `Approve ${params.spender_address} to spend ${params.token_address}`;
        }
        data = appendDataSuffix(data) as `0x${string}`;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description,
                  transaction: {
                    to: validToken,
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
