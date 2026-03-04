# Strategy Selection & Parameterization

Use this guide to evaluate whether a strategy makes sense and how to configure it. Apply to any LP strategy — not just the delta neutral example in strategies.md.

---

## 1. Pool / Strategy Selection

```
get_strategies(chain_id: 8453)           // browse all LP strategies + fee APY
get_lending_pools(chain_id: 8453)        // check borrow cost for leveraged strategies
```

**Viability check (leveraged):**

```
net_APY = fee_APY - (leverage - 1) × borrow_APY
```

Must be positive to justify the leverage cost. Higher leverage amplifies both sides.

**Pair type guidance:**

| Pair Type           | Example    | IL Risk  | Leverage Fit         | Range     |
| ------------------- | ---------- | -------- | -------------------- | --------- |
| Volatile / Stable   | WETH/USDC  | High     | Good (delta neutral) | Medium    |
| Correlated volatile | cbBTC/WETH | Moderate | Moderate             | Wider     |
| Stable / Stable     | USDC/USDT  | Very low | Low value            | Very wide |
| Same asset          | wstETH/ETH | Minimal  | Low value            | Tight     |

**Other signals to check:**

- Fee tier: higher fee tier (0.3%, 1%) = more fee per trade, better for volatile pairs
- Volume + TVL: high volume/TVL ratio = fees are being earned actively
- Active Merkl rewards: extra yield on top, check `get_strategies` APY breakdown

**`numeraire` — context-dependent meaning:**

- **`build_add_liquidity_tx`**: `numeraire` = account base currency (typically the stable side, e.g. USDC for a WETH/USDC position). The backend uses it to denominate calculations and determine the optimal swap ratio. For WETH/USDC: `numeraire = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC).
- **`build_repay_with_collateral_tx`**: `numeraire` = the debt token you're repaying (e.g. WETH address when repaying WETH debt). This differs from the add liquidity usage.

---

## 2. Range Width

Range width is the central tradeoff in any LP strategy. It is set in the Arcadia platform after enabling the rebalancer. Understanding the full tradeoff is essential for choosing parameters — a simple fee APY comparison is not enough.

### The full tradeoff

**Narrower range → higher fee capture, but three compounding costs:**

1. **Delta risk:** A narrow position changes composition rapidly as price moves. A WETH/USDC position that was 50/50 quickly becomes 100% WETH or 100% USDC when price moves even slightly. Your net exposure to the volatile asset fluctuates heavily — you are not truly delta neutral across the range.

2. **IL crystallized per rebalance:** Every rebalance permanently locks in accumulated impermanent loss. It doesn't disappear by rebalancing — it gets realized. More frequent rebalancing means more IL crystallized over time.

3. **Rebalancing costs:** Each rebalance incurs gas costs plus swap slippage (the rebalancer must swap tokens to re-establish the target ratio for the new range). For small or low-fee positions, rebalancing costs can easily exceed earned fees.

**Wider range → lower fee capture, but lower compounding costs:**

- Position stays in range longer → fewer rebalances → less IL crystallized, lower costs
- Delta exposure is spread over a wider price band → composition changes slowly
- Suitable when rebalancing quota is limited (few stAAA, no AAA to pay gas)

### Model-based parameter selection (recommended)

Rather than guessing range width, build a simple expected value model using market data:

```
expected_net_return =
  fee_APY × (time_in_range_fraction)
  − rebalance_frequency × (gas_cost_per_rebalance + slippage_cost_per_rebalance)
  − IL_rate × rebalance_frequency
```

Inputs to estimate from market data:

- **time_in_range_fraction**: given the pool's historical volatility, how often does price stay within ±X% of the current price? Use `get_strategies` APY + historical vol data.
- **rebalance_frequency**: how many rebalances per day does the chosen range width require? Wider range = fewer rebalances.
- **gas_cost_per_rebalance**: check current chain gas price × ~4M units per rebalance.
- **IL_rate**: IL as a function of how far price moved before the rebalance; wider ranges accumulate less IL per rebalance.

Vary range width in the model and pick the width that maximizes expected net return for the current market regime. Reassess if volatility regime changes.

**Practical reference (starting point only):**

| Range Width    | Fee Multiplier     | Rebalance Frequency (volatile pair) |
| -------------- | ------------------ | ----------------------------------- |
| Narrow ±2–5%   | Very high (10–50×) | Potentially multiple per day        |
| Medium ±10–20% | Moderate (3–10×)   | Every few days in normal markets    |
| Wide ±30–50%   | Low (1.5–3×)       | Weekly or less                      |

**Decision shortcuts:**

- **Limited stAAA quota** (1 free rebalance/day) → wider range to avoid burning quota
- **High stAAA holdings** (≥9,000) → can sustain narrower range with the increased quota
- **Large position (≥$50k)** → automatically bypasses rate limits; narrower range viable
- **POL / capital preservation** → use wider range or dynamic POL algorithm. See strategies.md.

---

## 3. Leverage Sizing

Leverage multiplies both fee income and liquidation risk.

| Leverage                      | Use case                                    | Health at entry          |
| ----------------------------- | ------------------------------------------- | ------------------------ |
| 1× (no borrow, `leverage: 0`) | Safe LP, no liquidation risk                | N/A                      |
| 2×                            | Classic delta neutral, volatile/stable pair | ~1.5–2×                  |
| 3×+                           | Aggressive yield, only in stable conditions | < 1.5× — watch carefully |

**Profitability check:**

```
borrow_APY × (leverage - 1) < fee_APY × leverage   → leverage is profitable
```

**Health factor at entry (rough estimate):**

```
collateral_value × collateral_factor
─────────────────────────────────────  ≈ starting health factor
         debt_value
```

Target ≥ 1.5 at entry. Never open below 1.3.

**When to use less leverage:**

- Borrow APY rising (utilization climbing in lending pool)
- Market showing high volatility (gap risk)
- Position already near support/resistance — a breakout would spike debt fast
- Health factor drifting toward 1.3

---

## 4. Combining Automation

| Combination                | Compatible | Notes                                                                                   |
| -------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| Rebalancer + Compounder    | ✅ Yes     | Rebalancer compounds at rebalance time; Compounder adds compounding between rebalances. |
| Rebalancer + Yield Claimer | ✅ Yes     | Yield claimer claims fees between rebalances; rebalancer compounds at rebalance time.   |
| Rebalancer + Merkl         | ✅ Yes     | Always combine when pool has Merkl incentives. Zero conflict.                           |
| Compounder + Merkl         | ✅ Yes     | Merkl rewards claimed separately from trading fees.                                     |
| Any AM + CoW Swapper       | ✅ Yes     | CoW Swapper sells accumulated tokens independently.                                     |

---

## 5. Exit Signals

Monitor periodically with `get_account_info` and `get_account_pnl`. Exit or adjust when:

| Signal                           | Threshold               | Action                                |
| -------------------------------- | ----------------------- | ------------------------------------- |
| Borrow APY > fee APY             | Persists 3+ checks      | Exit strategy — no longer profitable  |
| Health factor falling            | < 1.3                   | Add collateral or reduce debt         |
| Health factor critical           | < 1.2                   | Immediate action required             |
| Position out-of-range repeatedly | Bot can't keep up       | Widen range or reduce leverage        |
| Net PnL negative over time       | Check `get_account_pnl` | Evaluate whether IL is outpacing fees |

---

## 6. Quick Checklist Before Opening a Position

```
[ ] get_strategies → fee_APY noted
[ ] get_lending_pools → borrow_APY noted (if leveraged)
[ ] net_APY = fee_APY - (leverage-1) × borrow_APY > 0
[ ] Pair type matches strategy (volatile/stable for delta neutral)
[ ] Range width: modeled or estimated for pair volatility + stAAA quota
[ ] Leverage targets health factor ≥ 1.5 at entry
[ ] Merkl rewards active? → plan to enable Merkl Operator
[ ] Prefer compounding or cash flow? → Compounder vs. Yield Claimer
```
