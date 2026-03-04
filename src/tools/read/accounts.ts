import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

export function registerAccountTools(server: McpServer, api: ArcadiaApiClient) {
  server.tool(
    "get_account_info",
    "Get full overview of an Arcadia account: health factor, collateral value, debt, deposited assets, and liquidation price. Pass account_address for a specific account, or wallet_address to list all accounts owned by a wallet.",
    {
      account_address: z.string().optional().describe("Arcadia account address"),
      wallet_address: z.string().optional().describe("Wallet address to list all owned accounts"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ account_address, wallet_address, chain_id }) => {
      try {
        if (wallet_address) {
          const result = await api.getAccounts(chain_id, wallet_address);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }
        if (account_address) {
          const [overview, liquidation_price] = await Promise.all([
            api.getAccountOverview(chain_id, account_address),
            api.getLiquidationPrice(chain_id, account_address),
          ]);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ overview, liquidation_price }, null, 2),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Provide either account_address or wallet_address",
            },
          ],
          isError: true,
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

  server.tool(
    "get_account_history",
    "Get historical value of an Arcadia account over time.",
    {
      account_address: z.string().describe("Arcadia account address"),
      days: z.number().default(14).describe("Number of days of history"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ account_address, days, chain_id }) => {
      try {
        const result = await api.getAccountHistory(chain_id, account_address, days);
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

  server.tool(
    "get_account_pnl",
    "Get profit/loss and yield data for an Arcadia account.",
    {
      account_address: z.string().describe("Arcadia account address"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ account_address, chain_id }) => {
      try {
        const [pnl, yieldData] = await Promise.all([
          api.getPnl(chain_id, account_address),
          api.getYield(chain_id, account_address),
        ]);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ pnl, yield: yieldData }, null, 2) },
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
