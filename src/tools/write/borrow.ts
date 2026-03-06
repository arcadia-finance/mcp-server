import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { poolAbi } from "../../abis/index.js";
import { appendDataSuffix } from "../../utils/attribution.js";
import { validateAddress } from "../../utils/validation.js";

export function registerBorrowTool(
  server: McpServer,
  _chains: Record<ChainId, ChainConfig>,
  api: ArcadiaApiClient,
) {
  server.registerTool(
    "build_borrow_tx",
    {
      description:
        "Build an unsigned transaction to borrow from an Arcadia lending pool against account collateral. Only works with margin accounts (created with a creditor/lending pool). Spot accounts (no creditor) cannot borrow — the tool will validate this and reject. Before borrowing, verify the account has positive free margin via get_account_info: collateral_value must exceed used_margin.",
      inputSchema: {
        pool_address: z
          .string()
          .describe(
            "Lending pool: LP_WETH=0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2, LP_USDC=0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1, LP_CBBTC=0xa37E9b4369dc20940009030BfbC2088F09645e3B",
          ),
        account_address: z.string().describe("Arcadia account address used as collateral"),
        amount: z.string().describe("Amount in raw units"),
        to: z.string().describe("Address to receive borrowed tokens"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validAccount = validateAddress(params.account_address, "account_address");
        const validPool = validateAddress(params.pool_address, "pool_address");
        const validTo = validateAddress(params.to, "to");

        // Validate: account must have a creditor (margin account)
        const overview = (await api.getAccountOverview(
          params.chain_id,
          params.account_address,
        )) as Record<string, unknown>;
        const creditor = (overview.creditor as string) ?? "";
        if (!creditor || creditor === "0x0000000000000000000000000000000000000000") {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: This account has no creditor (spot account) and cannot borrow. Create a margin account with a creditor (lending pool) using build_create_account_tx.",
              },
            ],
            isError: true,
          };
        }

        // Pre-check: account must have free margin to absorb new debt
        const collateralValue = Number(overview.collateral_value ?? 0);
        const usedMargin = Number(overview.used_margin ?? 0);
        if (collateralValue <= usedMargin) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Account has no free margin (collateral_value: ${collateralValue}, used_margin: ${usedMargin}). Add more collateral before borrowing.`,
              },
            ],
            isError: true,
          };
        }

        const data = appendDataSuffix(
          encodeFunctionData({
            abi: poolAbi,
            functionName: "borrow",
            args: [BigInt(params.amount), validAccount, validTo, "0x000000" as `0x${string}`],
          }),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: "Borrow from Arcadia lending pool",
                  transaction: {
                    to: validPool,
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
