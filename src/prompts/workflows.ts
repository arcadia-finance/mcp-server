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

  server.registerPrompt(
    "migrate-to-aero",
    {
      description:
        "Move Slipstream positions (Aerodrome / Velodrome CL, V1 to V3) into Aero CL (MetadexCL V1), then reconnect automations.",
      argsSchema: {
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.string().optional().describe("Chain ID: 8453 Base (default) or 10 Optimism"),
      },
    },
    async ({ account_address, chain_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Move the Slipstream positions of Arcadia account ${account_address} on chain ${chain_id ?? "8453"} to Aero CL (MetadexCL V1).`,
              "",
              "Steps:",
              "1. Call read.account.info. Slipstream positions have dex_protocol slipstream, slipstream_v2, slipstream_v3 or a staked_* variant. If there are none, stop.",
              "2. If automation shows any enabled manager, call read.asset_manager.current now and keep its intents and config: the old managers are replaced after the move.",
              "3. Call write.account.aero_migration with action migrate and the account (whole account), or asset_address + position_id (one position).",
              "   - target_choice_required: show the selectable alternatives (tick spacing, fee, range_widened), ask the user which Aero pool to use, and call again with target_pool (one position) or targets (whole account).",
              "   - migration.skipped and 422 codes: report them as given, never decide eligibility yourself. deprecated_reward_token_in_pair: on Base, a margin account cannot take a pair holding the old AERO, so that position cannot move.",
              "   - 'not live yet': the migration has not opened on this chain. Stop and say so.",
              "   - tenderly_sim_status failure: do NOT broadcast. Rebuild once; report if it fails again.",
              "4. The owner signs and broadcasts the transaction.",
              "5. If managers_to_reconnect is not empty, reconnect: call write.account.automations (mode save) with the account, the new Aero position_id from read.account.info and the intents from step 2. Omit protocol. The save disables the old Slipstream managers.",
              "6. Verify with read.account.info: the position shows dex_protocol metadexcl_v1 or staked_metadexcl_v1, and automation lists the reconnected managers.",
              "",
              "Token upgrades, separate from the position move, same tool:",
              "- action upgrade_aero: loose old AERO in a Base account, 1:1 into the new AERO.",
              "- action upgrade_velo with chain_id 10 and owner_address: wallet VELO on Optimism, new AERO paid on Base. VELO in an account must be withdrawn first.",
              "",
              "Margin accounts hold Aero positions on Base only; Optimism and Robinhood Aero positions are spot only.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
