# Strategy Templates

These are templates and examples — not the only valid approaches. Adapt parameters to current conditions. Use selection.md to evaluate whether a strategy fits before executing.

## Key Parameter Notes

- **`build_add_liquidity_tx`** takes one `deposit_asset` — the backend swaps it to the optimal ratio for the LP. You do NOT pass both tokens — deposit one asset and the backend handles the split. If you deposited both tokens, only `deposit_asset` is used for the LP mint; the other remains as separate collateral in the account.
- **`deposit_amount`** refers to collateral already in the account (deposited via `build_deposit_tx`). The backend uses this from account collateral — it does NOT pull from the wallet again.
- **`numeraire`** meaning depends on the tool:
  - In `build_add_liquidity_tx`: base currency for the account (typically the stable side, e.g. USDC).
  - In `build_repay_with_collateral_tx`: the debt token you're repaying (e.g. WETH when repaying WETH debt).
- **`leverage`**: `0` = no leverage. `2` = 2x. Do NOT use `1` for no leverage — use `0`. When `leverage > 0`, borrowing is handled internally by `build_add_liquidity_tx` — do NOT call `build_borrow_tx` separately.
- **LP NFT details**: after `build_add_liquidity_tx`, call `get_account_info` to find `asset_address` (the position manager contract) and `asset_id` (NFT token ID) in the positions list — needed for unstake/remove/claim actions.
- **`amount: "max_uint256"`** in `build_repay_tx` repays all debt in full.
- **`account_version`**: always pass `account_version: 0` (latest). Applies to both `build_create_account_tx` and `build_add_liquidity_tx`.
- **`slippage`** is in basis points: 100 = 1%, 50 = 0.5%.
- **`salt`** in `build_create_account_tx` is a random uint32 used for deterministic address derivation. Use any random 32-bit integer (e.g. `Math.floor(Math.random() * 2**32)`).
- **`creditor`** = the lending pool address you want to borrow from. Set at account creation via `build_create_account_tx`. Determines which asset the account can borrow. Omit for spot-only accounts (no borrowing). `build_add_liquidity_tx` infers the creditor from the account's config — no separate creditor param needed.
- **`build_withdraw_tx`**: pass exact amounts from `get_account_info`. Does NOT support `"max_uint256"` — will error.
- **Getting the account address after creation:** The address is deterministic from the salt. It's visible in the tx receipt events. Or call `get_account_info(wallet_address: ...)` after creation to list all accounts.

---

## Core Lifecycle (all strategies)

```
Open:    approve tokens → create account → deposit collateral → add liquidity → enable automation
Monitor: get_account_info (health), get_account_pnl (profitability)
Adjust:  add collateral or repay debt if health drops; remove + re-add liquidity to manually rebalance range; remove liquidity to reduce exposure
Close:   disable rebalancer → unstake → claim → remove liquidity → repay debt → withdraw
```

---

## Strategy A: Delta Neutral Leveraged LP

**Goal:** Earn LP trading fees with minimal directional exposure to the volatile asset.

**Mechanism:** In a VOLATILE/STABLE pool (e.g., WETH/USDC), borrow the volatile asset (WETH) to fund the LP position. Your LP long exposure ≈ your debt short exposure → approximately delta neutral.

**Why it works:**

- LP position is ~50% WETH, ~50% USDC by value at any given price
- You borrow WETH to provide it → WETH debt ≈ WETH held in LP
- Net WETH exposure ≈ 0 (small residual from IL)
- You earn LP fees on the full leveraged notional

**Preconditions:** `fee_APY > borrow_APY` (check selection.md §1)

### Step-by-step

```
// 1. FIND A POOL
get_strategies(chain_id: 8453)
→ Filter for volatile/stable pair (WETH/USDC, cbBTC/USDC, etc.)
→ Note: strategy_id (integer), pool_protocol (Slipstream V1/V2, UniV3, UniV4), fee_APY

// 2. CHECK BORROW COST
get_lending_pools(chain_id: 8453)
→ Find the WETH lending pool (address: 0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2)
→ If borrow_apy > fee_apy → stop, strategy not profitable

// 3. CREATE ACCOUNT
build_create_account_tx(
  salt: <random uint32, e.g. 3141592653>,
  account_version: 0,   // 0 = latest version (V4) — required for build_configure_asset_manager_tx
  creditor: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",  // WETH lending pool — enables margin/borrow
  chain_id: 8453
)
→ Submit tx, note deployed account address from tx receipt
→ Or call get_account_info(wallet_address: ...) to find the new account address

// 4. APPROVE + DEPOSIT COLLATERAL
build_approve_tx(
  token_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC
  spender_address: <account_address>,
  amount: "max_uint256",
  chain_id: 8453
)
build_deposit_tx(
  account_address: <account_address>,
  asset_addresses: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"],  // USDC
  asset_amounts: ["10000000000"],  // 10,000 USDC (6 decimals: 10000 × 10^6)
  chain_id: 8453
)

// 6. OPEN LEVERAGED LP (atomic: borrow + swap + mint)
// The backend takes your deposited USDC, borrows WETH, swaps to optimal ratio, and mints the LP.
build_add_liquidity_tx(
  account_address: <account_address>,
  wallet_address: <owner_wallet>,
  strategy_id: <integer from step 1>,
  deposit_asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // USDC — the asset already in account
  deposit_amount: "10000000000",   // 10,000 USDC
  deposit_decimals: 6,
  numeraire: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // USDC = base currency of this account
  numeraire_decimals: 6,
  leverage: 2,        // 2 = 2x leverage (0 = no leverage, 3 = 3x, etc.)
  slippage: 100,      // 100 = 1% slippage tolerance (basis points)
  account_version: 0, // must match the account version (0 = latest)
  chain_id: 8453
)

// 7. ENABLE AND CONFIGURE REBALANCER (match address to LP protocol from step 1)
build_configure_asset_manager_tx(
  account_address: <account_address>,
  asset_manager_address: "0x953Ff365d0b562ceC658dc46B394E9282338d9Ea",  // Slipstream V2
  am_type: "rebalancer",
  trigger_lower_ratio: 0,      // 0 = trigger exactly at boundary. Values scaled by 1e6: 50000 = 5% before boundary
  trigger_upper_ratio: 0,      // same as above — must be integer
  compound_leftovers: "all",   // "all" | "none" | "token0" | "token1"
  min_rebalance_time: 3600,    // minimum seconds between rebalances (3600 = 1 hour)
  chain_id: 8453
)
// → Range width and reposition mode must be configured in the Arcadia platform

// 8. ENABLE MERKL (if pool has Merkl incentives — check fee APY breakdown in step 1)
build_configure_asset_manager_tx(
  account_address: <account_address>,
  asset_manager_address: "0x969F0251360b9Cf11c68f6Ce9587924c1B8b42C6",
  am_type: "merkl_operator",
  reward_recipient: <owner_wallet>,
  chain_id: 8453
)
```

### Monitoring

```
// Run periodically (daily or on request)
get_account_info(account_address: <account_address>, chain_id: 8453)
→ health_factor:
    > 1.5    → safe
    1.2–1.5  → monitor closely, consider adding collateral
    < 1.2    → ACTION REQUIRED

get_account_pnl(account_address: <account_address>, chain_id: 8453)
→ If net yield is consistently negative → evaluate exit

get_lending_pools(chain_id: 8453)
→ If borrow_APY risen above fee_APY → exit signal
```

### Responding to health factor drops

```
// Option A: Add collateral (increases health, cheapest)
build_approve_tx(token_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", spender_address: <account>, amount: "max_uint256", chain_id: 8453)
build_deposit_tx(account_address: <account>, asset_addresses: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"], asset_amounts: ["<amount>"], chain_id: 8453)

// Option B: Repay some WETH debt (reduces leverage)
// NOTE: you must approve the WETH pool to spend WETH from your wallet first
build_approve_tx(token_address: "0x4200000000000000000000000000000000000006", spender_address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2", amount: "max_uint256", chain_id: 8453)
build_repay_tx(
  pool_address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",  // WETH pool
  account_address: <account>,
  amount: "<raw_weth_amount_in_wei>",  // e.g. "100000000000000000" = 0.1 WETH
  chain_id: 8453
)

// Option C: Atomic sell USDC collateral → repay WETH debt (one flash tx, no wallet WETH needed)
build_repay_with_collateral_tx(
  account_address: <account>,
  asset_from: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // sell USDC from account
  amount_in: "<usdc_amount_to_sell>",                          // collateral amount to sell (input side, NOT debt amount)
  numeraire: "0x4200000000000000000000000000000000000006",     // WETH = debt token being repaid (NOT the stable side here)
  creditor: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",    // WETH lending pool
  slippage: 100,
  chain_id: 8453
)
```

### Closing

```
// 0. First disable the rebalancer (prevents it from acting during close)
build_set_asset_manager_tx(
  account_address: <account>,
  asset_manager_address: "0x953Ff365d0b562ceC658dc46B394E9282338d9Ea",
  enabled: false,
  chain_id: 8453
)

// 1. Find LP NFT details — call get_account_info and read the positions list:
//    asset_address = the position manager contract
//    asset_id = the NFT token ID
get_account_info(account_address: <account>, chain_id: 8453)

// 2. Unstake (must unstake before removing liquidity), claim, remove
// Pass the STAKED position manager as asset_address to trigger unstaking (auto-detected)
build_position_action_tx(action: "unstake", asset_address: <staked_pm_address>, asset_id: <nft_id>, account_address: <account>, chain_id: 8453)
build_position_action_tx(action: "claim", asset_address: <lp_nft_address>, asset_id: <nft_id>, account_address: <account>, chain_id: 8453)
build_remove_liquidity_tx(account_address: <account>, asset_address: <lp_nft_address>, asset_id: <nft_id>, adjustment: <liquidity_amount>, chain_id: 8453)
// ⚠ Removing liquidity drops collateral while debt remains — health factor drops.
// Submit the repay tx immediately after to minimize liquidation risk window.

// 3. Repay all WETH debt (build_repay_tx sends from wallet — approve the pool to spend your WETH first)
build_approve_tx(token_address: "0x4200000000000000000000000000000000000006", spender_address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2", amount: "max_uint256", chain_id: 8453)
build_repay_tx(
  pool_address: "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2",
  account_address: <account>,
  amount: "max_uint256",  // repay all
  chain_id: 8453
)

// 4. Withdraw all remaining assets to wallet (always goes to account owner)
// Call get_account_info first to get exact balances — no max_uint256 supported
build_withdraw_tx(
  account_address: <account>,
  asset_addresses: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0x4200000000000000000000000000000000000006"],  // USDC + WETH
  asset_amounts: ["<usdc_balance>", "<weth_balance>"],  // exact amounts from get_account_info
  chain_id: 8453
)
```

**Key risks:**

- IL: WETH price deviation from entry accumulates IL. Rebalancer mitigates but doesn't eliminate.
- Liquidation: If WETH pumps sharply, health factor drops fast. Keep buffer > 1.3.
- Borrow cost: WETH utilization spikes can make strategy unprofitable quickly.
- Agent role: periodic health monitoring only — the rebalancer handles range management.

---

## Strategy B: Protocol Owned Liquidity (POL)

**IMPORTANT: Different objective.** POL is NOT a yield-maximizing strategy. It prioritizes capital preservation and reliable market liquidity provision.

**Who uses it:** DAOs, protocols, and treasuries that need to:

- Maintain consistent liquidity for their token pair at all times
- Protect treasury capital from large IL
- Provide deep liquidity to traders regardless of yield

### How POL differs from retail LP

| Dimension      | Retail (delta neutral)     | Protocol Owned Liquidity             |
| -------------- | -------------------------- | ------------------------------------ |
| Objective      | Maximize fees + yield      | Reliable market presence             |
| Range          | Narrow (high fee capture)  | Wide or dynamic (capital protection) |
| Rebalancing    | Aggressive (stay in range) | Conservative (minimize cost)         |
| Leverage       | Yes                        | No — protect principal               |
| IL tolerance   | Moderate (offset by fees)  | Low — preserving treasury            |
| Success metric | Fee APY > borrow APY       | Liquidity depth maintained           |

### POL rebalancer behavior

The `protocol_owned_liquidity` strategy type uses a dynamic range algorithm (k1/k2 coefficients) that adjusts range width based on price deviation. It maintains a "base range" for core liquidity plus a "limit order" component for excess. The rebalance threshold determines how far price must move before repositioning. This results in fewer rebalances (lower cost) at the expense of occasionally being partially out-of-range.

### Setup

```
// Same tools, different intent — no leverage, wider slippage tolerance

// 1. Approve treasury tokens
build_approve_tx(token_address: <token>, spender_address: <account>, amount: "max_uint256", chain_id: 8453)

// 2. Create account (separate from retail positions)
build_create_account_tx(
  salt: <random uint32>,
  account_version: 0,  // latest version
  chain_id: 8453
  // no creditor = spot account (no leverage, no liquidation risk)
)

// 3. Deposit treasury tokens
build_deposit_tx(account_address: <account>, ...)

// 4. Open LP (no leverage)
build_add_liquidity_tx(
  ...,
  leverage: 0,        // 0 = no leverage (NOT 1 — use 0 for unleveraged)
  slippage: 200,      // 2% — wider tolerance for POL
  account_version: 0,
  ...
)

// 5. Enable rebalancer with POL strategy hook
build_configure_asset_manager_tx(
  account_address: <account>,
  asset_manager_address: <rebalancer matching LP protocol>,
  am_type: "rebalancer",
  strategy_hook: "0xed332137b463D98868132791EC3f641c8eE3bE71",  // POL dynamic range algorithm
  trigger_lower_ratio: 0,
  trigger_upper_ratio: 0,
  compound_leftovers: "all",
  min_rebalance_time: 3600,
  chain_id: 8453
)
// → POL tuning params (base_range, k1, k2, rebalance_threshold) configured in Arcadia platform
```

**MCP limitation:** POL tuning parameters are configured in the Arcadia platform backend, not via MCP tools. Agents can deploy and enable the rebalancer contract, but specific POL parameterization requires platform access.

### Monitoring for POL

```
get_account_info → verify position is in range (primary check — no liquidation risk since no leverage)
get_account_pnl  → track IL vs. fee income
                   Note: net negative IL is EXPECTED and ACCEPTABLE for POL
                   The treasury is "paying" for market liquidity
get_recommendation → check if rebalancing is needed
```

**POL monitoring goal:** Ensure sufficient liquidity is deployed and treasury capital is not eroding excessively — not maximizing return.
