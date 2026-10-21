import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

export function registerWorkflowPrompts(server: McpServer) {
  server.registerPrompt(
    "analyze-account",
    {
      description:
        "Analyze an Arcadia account: health factor, positions, PnL, automation status, and recommendations.",
      argsSchema: z.object({
        account_address: z.string().describe("Arcadia account address to analyze"),
        chain_id: z.string().optional().describe("Chain ID (default: 8453 Base)"),
      }),
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
              "1. Call read_account_info to get health factor, collateral, debt, positions, and automation status",
              "2. Call read_account_pnl to check profitability and yield earned",
              "3. If leveraged (health_factor < 1), call read_pool_list to compare borrow APY vs fee APY",
              "4. Call read_strategy_recommendation to check if rebalancing is needed",
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
      argsSchema: z.object({
        chain_id: z.string().optional().describe("Chain ID (default: 8453 Base)"),
        deposit_token: z.string().optional().describe("Token to deposit (e.g. USDC, WETH)"),
      }),
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
              "1. Call read_strategy_list(featured_only: true) to see top LP strategies with fee APY",
              "2. Call read_strategy_info(strategy_id: <id>) for promising ones to see APY per range width",
              "3. Call read_pool_list to check borrow APY for leveraged strategies",
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
      argsSchema: z.object({
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.string().optional().describe("Chain ID (default: 8453 Base)"),
      }),
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
              "1. Call read_account_info to see the account's positions and note the LP position id",
              "2. Call read_asset_manager_current to see what is already enabled, including any superseded managers to clear",
              "3. Call read_asset_manager_intents with the account address to see which intents are available and why any are blocked",
              "4. Ask which automations the user wants, then build one intents array covering all of them:",
              "   - compound_fees: reinvest fees and rewards into the LP",
              "   - claim_rewards: claim yield out, optionally converted to one token via CowSwap",
              "   - add_to_lp: fold idle pool-token balances back into the LP",
              "   - rebalance: reposition when out of range (or take_profit / POL strategy)",
              "   - claim_merkl: auto-claim Merkl incentive rewards",
              "5. Call write_account_automations with the account, the LP position_id and that intents array",
              "",
              "The intents array is the complete desired state, so include every automation the user wants kept, not just the new ones.",
              "If a compatibility rule rejects the combination, read errors[].reason, adjust and retry.",
              "To change one automation without restating the rest, use write_account_automations_delta.",
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
        "Upgrade an Arcadia account to Aero CL (MetadexCL V1): move its Slipstream positions (Aerodrome / Velodrome CL, V1 to V3) and old AERO in one transaction, then reconnect automations.",
      argsSchema: z.object({
        account_address: z.string().describe("Arcadia account address"),
        chain_id: z.string().optional().describe("Chain ID: 8453 Base (default) or 10 Optimism"),
      }),
    },
    async ({ account_address, chain_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Upgrade Arcadia account ${account_address} on chain ${chain_id ?? "8453"} to Aero CL (MetadexCL V1).`,
              "",
              "Steps:",
              "1. Call read_account_aero_upgrade with the account. If it answers an empty accounts list and an empty failed_accounts list, there is nothing to upgrade: stop. An account in failed_accounts could not be checked: tell the user and retry later. Otherwise note its status and counts.",
              "2. Call read_account_info. Slipstream positions have dex_protocol slipstream, slipstream_v2, slipstream_v3 or a staked_* variant. If automation shows any enabled manager, call read_asset_manager_current now and keep its intents and config: the old managers are replaced after the move.",
              "3. Call write_account_aero_upgrade with the account. It returns the plan (items with status and reason) and, when something can go now, one transaction.",
              "   - choices_required: a position has status choose and stays where it is until the user picks a pool. Show its options whose disabled_reason is null (tick_spacing, fee, apy, tvl_usd, is_new, range_widened), ask the user which Aero pool to use, and call again with choices. A transaction returned with choices_required moves only the ready items. Once that transaction is signed, a call made before it confirms is built on the old state: wait for the confirmation before calling again. Without a transaction there is nothing to sign yet.",
              "   - waiting or blocked items: report their reason as given (pool_not_on_aero, staking_not_open, target_price_mismatch, account_unhealthy, exposure_limit, dust_position, ...). Never decide eligibility yourself and do not retry in a loop.",
              "   - not_open: the AERO upgrade opens at opens_at. Tell the user when to come back.",
              "   - the transaction's simulation failed: the tool returns an error and no transaction. Rebuild once; report if it fails again. A plan without a transaction can also show tenderly_sim_status failure: its items wait on account_unhealthy or exposure_limit, so report those reasons and do not rebuild.",
              "4. The owner signs and broadcasts the transaction.",
              "5. If managers_to_reconnect is not empty, reconnect: call write_account_automations (mode save) with the account, the new Aero position_id from read_account_info and the intents from step 2. Omit protocol. When old_managers_still_needed is true, a Slipstream position stays behind: use write_account_automations_delta (enable) for the Aero position instead, so the old managers keep running.",
              "6. Verify with read_account_info: moved positions show dex_protocol metadexcl_v1 or staked_metadexcl_v1, old AERO shows as the new AERO, and automation lists the reconnected managers.",
              "",
              "VELO in the owner's wallet on Optimism is separate: write_wallet_upgrade_velo (chain_id 10, owner_address) returns wallet transactions; the new AERO is paid on Base. VELO inside an account must be withdrawn first. VELO stays usable, so this is optional.",
              "",
              "Spot and margin accounts can hold Aero positions, staked or not, on Base, Optimism and Robinhood, within each lending pool's limits.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
