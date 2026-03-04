import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerAddLiquidityTool(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "build_add_liquidity_tx",
    "Build an unsigned flash-action transaction to add liquidity to an Arcadia LP strategy. Atomically deposits tokens, swaps to optimal ratio, mints LP position, and optionally borrows (leverage) — all in one transaction. The backend handles swap routing and Tenderly simulation. When leverage > 0, the backend borrows from the account's creditor (set at account creation via build_create_account_tx).",
    {
      account_address: z.string().describe("Arcadia account address"),
      wallet_address: z.string().describe("Wallet address of the account owner"),
      deposit_asset: z.string().describe("Token address to deposit"),
      deposit_amount: z.string().describe("Amount in raw units"),
      deposit_decimals: z.number().describe("Token decimals, e.g. 6 for USDC, 18 for WETH"),
      strategy_id: z.number().describe("From get_strategies tool"),
      numeraire: z.string().describe("Account base currency token address"),
      numeraire_decimals: z.number().describe("Numeraire token decimals"),
      leverage: z.number().optional().default(0).describe("0 = no borrow, 2 = 2x leverage"),
      slippage: z.number().optional().default(100).describe("Basis points, 100 = 1%"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
      account_version: z
        .number()
        .optional()
        .default(0)
        .describe("Account version (0 = latest, recommended. 1/2 = legacy)"),
    },
    async ({
      account_address,
      wallet_address,
      deposit_asset,
      deposit_amount,
      deposit_decimals,
      strategy_id,
      numeraire,
      numeraire_decimals,
      leverage,
      slippage,
      chain_id,
      account_version,
    }) => {
      try {
        const body = {
          buy: [
            {
              asset_address: deposit_asset,
              distribution: 1,
              decimals: deposit_decimals,
              strategy_id,
            },
          ],
          sell: [],
          deposits: {
            addresses: [deposit_asset],
            ids: [0],
            amounts: [deposit_amount],
            decimals: [deposit_decimals],
          },
          withdraws: { addresses: [], ids: [], amounts: [], decimals: [] },
          wallet_address,
          account_address,
          numeraire,
          numeraire_decimals,
          debt: {
            take: (leverage ?? 0) > 0,
            leverage: leverage ?? 0,
            repay: 0,
            creditor: "",
          },
          chain_id,
          version: account_version ?? 0,
          action_type: "account.add-lp",
          slippage: slippage ?? 100,
        };
        const result = await api.getBundleCalldata(body);
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
