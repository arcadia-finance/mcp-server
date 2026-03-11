import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../../config/chains.js";
import { poolAbi } from "../../../abis/index.js";
import { appendDataSuffix } from "../../../utils/attribution.js";
import { validateAddress } from "../../../utils/validation.js";
import { SimpleTransactionOutput } from "../../output-schemas.js";

export function registerRepayTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "write.account.repay",
    {
      annotations: {
        title: "Build Repay Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      outputSchema: SimpleTransactionOutput,
      description:
        "Repay debt to an Arcadia lending pool using tokens from the wallet (requires ERC20 allowance). To repay using account collateral instead (no wallet tokens needed), use write.account.deleverage. Check allowance first (read.wallet.allowances), then approve the pool if needed (write.wallet.approve). Check outstanding debt with read.account.info.",
      inputSchema: {
        pool_address: z
          .string()
          .describe(
            "Lending pool address. Base: LP_WETH=0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2, LP_USDC=0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1, LP_CBBTC=0xa37E9b4369dc20940009030BfbC2088F09645e3B",
          ),
        account_address: z.string().describe("Arcadia account address with debt"),
        amount: z
          .string()
          .describe("Amount in raw units, or 'max_uint256' to repay all debt in full"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validAccount = validateAddress(params.account_address, "account_address");
        const validPool = validateAddress(params.pool_address, "pool_address");

        const amount = params.amount === "max_uint256" ? 2n ** 256n - 1n : BigInt(params.amount);
        if (amount === 0n) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: amount must be greater than 0. Use 'max_uint256' to repay all debt.",
              },
            ],
            isError: true,
          };
        }
        const data = appendDataSuffix(
          encodeFunctionData({
            abi: poolAbi,
            functionName: "repay",
            args: [amount, validAccount],
          }),
        );

        const result = {
          description: "Repay debt to Arcadia lending pool",
          transaction: {
            to: validPool,
            data,
            value: "0",
            chainId: params.chain_id,
          },
        };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
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
