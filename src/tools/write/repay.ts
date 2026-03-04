import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { poolAbi } from "../../abis/index.js";

export function registerRepayTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.tool(
    "build_repay_tx",
    "Build an unsigned transaction to repay debt to an Arcadia lending pool. Approve the pool to spend the repayment token first.",
    {
      pool_address: z
        .string()
        .describe(
          "Lending pool address. Base: LP_WETH=0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2, LP_USDC=0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1, LP_CBBTC=0xa37E9b4369dc20940009030BfbC2088F09645e3B",
        ),
      account_address: z.string().describe("Arcadia account address with debt"),
      amount: z
        .string()
        .describe("Amount in raw units, or 'max_uint256' to repay all debt in full"),
      chain_id: z.number().default(8453).describe("Chain ID (default: Base 8453)"),
    },
    async (params) => {
      try {
        const amount = params.amount === "max_uint256" ? 2n ** 256n - 1n : BigInt(params.amount);
        const data = encodeFunctionData({
          abi: poolAbi,
          functionName: "repay",
          args: [amount, params.account_address as `0x${string}`],
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: "Repay debt to Arcadia lending pool",
                  transaction: {
                    to: params.pool_address as `0x${string}`,
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
