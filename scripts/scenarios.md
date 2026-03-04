# Agent Test Scenarios

Test prompts for a Claude Code session with the Arcadia MCP server configured. After each `build_*_tx` tool call, sign with:

```bash
npx tsx scripts/sign-tx.ts '<paste transaction JSON>'
```

---

## S1: Read-only exploration

**Prompt:** "What LP strategies are available on Base? Which has the highest fee APY? Is leveraged LP profitable given current borrow rates?"

**Expected tools:** `get_strategies`, `get_lending_pools`
**Success:** Agent compares fee APY vs borrow APY, gives a recommendation.

---

## S2: Account discovery

**Prompt:** "Show me my Arcadia accounts and their positions on Base. My wallet is `<wallet_address>`."

**Expected tools:** `get_account_info(wallet_address: ...)`
**Success:** Agent lists accounts, shows collateral, debt, health factor, positions.

---

## S3: Withdraw from existing account

**Prompt:** "Withdraw 1 USDC from my Arcadia account."

**Expected tools:** `get_account_info` → `build_withdraw_tx` → sign
**Success:** Agent finds account, checks USDC balance, builds withdraw tx with correct amount in raw units (1e6).

---

## S4: Create second account + deposit

**Prompt:** "Create a new Arcadia account on Base and deposit 1 USDC into it."

**Expected tools:** `build_create_account_tx` → sign → `build_approve_tx` → sign → `build_deposit_tx` → sign → `get_account_info`
**Success:** Agent handles full flow including approval step, uses correct raw amounts.

---

## S5: Open LP position (no leverage)

**Prompt:** "Open a USDC/WETH LP position on Aerodrome using my Arcadia account, no leverage. Use 1 USDC."

**Expected tools:** `get_strategies` → pick strategy → `build_add_liquidity_tx(leverage: 0)` → sign
**Success:** Agent selects correct strategy, passes all required params (deposit_asset, deposit_decimals, numeraire, etc.).

---

## S6: Open leveraged LP

**Prompt:** "Open a 2x leveraged USDC/WETH LP position on Aerodrome."

**Expected tools:** Same as S5 but `leverage: 2`. Then `get_account_info` to check health.
**Success:** Agent understands leverage param, checks health factor after opening.

---

## S7: Enable automation

**Prompt:** "Set up auto-rebalancing and compounding on my LP position."

**Expected tools:** `get_account_info` → find LP → `build_configure_asset_manager_tx(am_type: "rebalancer")` → sign → `build_configure_asset_manager_tx(am_type: "compounder")` → sign
**Success:** Agent picks correct asset manager addresses based on pool protocol.

---

## S8: Monitor

**Prompt:** "How is my position doing? Should I take any action?"

**Expected tools:** `get_account_info` + `get_account_pnl` + `get_recommendation`
**Success:** Agent interprets health factor, PnL, and recommendation. Suggests action if needed.

---

## S9: Close position

**Prompt:** "Close my entire LP position. Unwind everything."

**Expected tools (in order):**
1. `build_set_asset_manager_tx(enabled: false)` — disable automation
2. `build_position_action_tx(action: "unstake")` — unstake LP
3. `build_position_action_tx(action: "claim")` — claim rewards
4. `build_remove_liquidity_tx` — remove all liquidity
5. `build_repay_tx(amount: "max_uint256")` — repay all debt (if leveraged)
6. `build_withdraw_tx` — withdraw remaining assets

**Success:** Agent executes in correct order, handles debt repay if present.

---

## S10: Emergency — low health

**Prompt:** "My health factor is 1.15. What should I do?"

**Expected:** Agent suggests options:
- A: Deposit more collateral
- B: Repay debt from wallet
- C: `build_repay_with_collateral_tx` (atomic)

**Success:** Agent explains tradeoffs and executes chosen option.
