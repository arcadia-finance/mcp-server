import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerWorkflowPrompts(server: McpServer) {
  server.registerPrompt(
    "analyze-account",
    {
      description:
        "Analyze an Arcadia account: health factor, positions, PnL, automation status, and recommendations.",
      argsSchema: {
        account_address: z.string().describe("Arcadia account address to analyze"),
        chain_id: z.string().optional().describe("Chain ID (default: 8453 Base)"),
      },
    },
    async ({ account_address, chain_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Analyze Arcadia account ${account_address} on chain ${chain_id ?? "8453"}.`,
              "",
              "Steps:",
              "1. Call read.account.info to get health factor, collateral, debt, positions, and automation status",
              "2. Call read.account.pnl to check profitability and yield earned",
              "3. If leveraged (health_factor < 1), call read.pool.list to compare borrow APY vs fee APY",
              "4. Call read.strategy.recommendation to check if rebalancing is needed",
              "",
              "Provide a summary covering:",
              "- Health factor interpretation (1 = no debt/safest, >0.5 = healthy, <0.5 = monitor, <0.2 = action needed)",
              "- Position composition and current value",
              "- PnL: is the strategy profitable?",
              "- Automation: which asset managers are enabled?",
              "- Recommendations: any actions needed?",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "find-yield-strategy",
    {
      description:
        "Evaluate LP strategies on Arcadia: compare fee APY vs borrow cost, select pool, range width, and leverage.",
      argsSchema: {
        chain_id: z.string().optional().describe("Chain ID (default: 8453 Base)"),
        deposit_token: z.string().optional().describe("Token to deposit (e.g. USDC, WETH)"),
      },
    },
    async ({ chain_id, deposit_token }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Find the best yield strategy on Arcadia (chain ${chain_id ?? "8453"})${deposit_token ? ` for depositing ${deposit_token}` : ""}.`,
              "",
              "Steps:",
              "1. Call read.strategy.list(featured_only: true) to see top LP strategies with fee APY",
              "2. Call read.strategy.info(strategy_id: <id>) for promising ones to see APY per range width",
              "3. Call read.pool.list to check borrow APY for leveraged strategies",
              "4. Evaluate: net_APY = fee_APY - (leverage - 1) * borrow_APY > 0?",
              "",
              "For each viable strategy, assess:",
              "- Pair type (volatile/stable, correlated, stable/stable)",
              "- Recommended range width given volatility",
              "- Leverage sizing (target health factor >= 0.5 at entry)",
              "- Automation combo (rebalance + compound_fees/claim_rewards + claim_merkl if applicable)",
              "",
              "Recommend the top 1-3 strategies with reasoning.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "setup-automation",
    {
      description:
        "Configure automations (compounding, claiming, rebalancing, Merkl) for an Arcadia account.",
      argsSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.string().optional().describe("Chain ID (default: 8453 Base)"),
      },
    },
    async ({ account_address, chain_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Set up automation for Arcadia account ${account_address} on chain ${chain_id ?? "8453"}.`,
              "",
              "Steps:",
              "1. Call read.account.info to see the account's positions and note the LP position id",
              "2. Call read.asset_manager.current to see what is already enabled, including any superseded managers to clear",
              "3. Call read.asset_manager.intents with the account address to see which intents are available and why any are blocked",
              "4. Ask which automations the user wants, then build one intents array covering all of them:",
              "   - compound_fees: reinvest fees and rewards into the LP",
              "   - claim_rewards: claim yield out, optionally converted to one token via CowSwap",
              "   - add_to_lp: fold idle pool-token balances back into the LP",
              "   - rebalance: reposition when out of range (or take_profit / POL strategy)",
              "   - claim_merkl: auto-claim Merkl incentive rewards",
              "5. Call write.account.automations with the account, the LP position_id and that intents array",
              "",
              "The intents array is the complete desired state, so include every automation the user wants kept, not just the new ones.",
              "If a compatibility rule rejects the combination, read errors[].reason, adjust and retry.",
              "To change one automation without restating the rest, use write.account.automations_delta.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
