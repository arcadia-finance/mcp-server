import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { factoryAbi } from "../../abis/index.js";
import { PROTOCOL } from "../../config/addresses.js";

export function registerCreateAccountTool(
  server: McpServer,
  _chains: Record<ChainId, ChainConfig>,
) {
  server.tool(
    "build_create_account_tx",
    "Build an unsigned transaction to create a new Arcadia account via the Factory contract.",
    {
      salt: z.number().describe("Unique salt (uint32) for deterministic account address"),
      account_version: z
        .number()
        .default(0)
        .describe("Account version (0 = latest, recommended. 1/2 = legacy)"),
      creditor: z
        .string()
        .optional()
        .describe("Lending pool address for margin account, or omit for spot account"),
      chain_id: z.number().default(8453).describe("Chain ID (default: Base 8453)"),
    },
    async (params) => {
      try {
        const data = encodeFunctionData({
          abi: factoryAbi,
          functionName: "createAccount",
          args: [
            params.salt,
            BigInt(params.account_version),
            (params.creditor ?? "0x0000000000000000000000000000000000000000") as `0x${string}`,
          ],
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: "Create a new Arcadia account",
                  transaction: {
                    to: PROTOCOL.factory,
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
