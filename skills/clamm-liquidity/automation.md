# Automation Setup

All automation on Arcadia uses V3/V4 accounts only. Arcadia's backend bots do the work once configured.

## Agent Workflow

```
1. Call read.asset_managers.intents to discover available automations and their params
2. Call write.asset_managers.{intent} for each desired automation → returns encoded args
3. Optionally merge arrays from multiple intent calls to combine changes
4. Call write.account.set_asset_managers with the (merged) args → unsigned tx
```

## Combining Automations

Each intent tool returns `{ description, asset_managers: [...], statuses: [...], datas: [...] }`. To apply multiple automations in one tx, concatenate the arrays from each call before passing to `write.account.set_asset_managers`.

Example: enable rebalancer + merkl_operator in one tx:

```
rebalancer = write.asset_managers.rebalancer(pool_protocol: "slipstream", ...)
merkl = write.asset_managers.merkl_operator(reward_recipient: "0x...", ...)
write.account.set_asset_managers(
  account_address: "0x...",
  asset_managers: [...rebalancer.asset_managers, ...merkl.asset_managers],
  statuses: [...rebalancer.statuses, ...merkl.statuses],
  datas: [...rebalancer.datas, ...merkl.datas]
)
```

To disable: call any intent tool with `enabled: false`, then merge and submit.

---

## Rebalancer

**What it does:** When the LP position goes out of range, Arcadia's bot repositions it to a new range centered on the current price. All pending fees and staking rewards are claimed and compounded into the new position.

**Tool:** `write.asset_managers.rebalancer`

**Strategy modes:**

- **default** (all params at defaults): uses `when_out_of_range` — rebalances exactly when price exits the position range
- **custom** (any param differs): uses `time_and_price_based_triggers` — adds configurable trigger offsets, cooldowns, and token composition

**Key params:**

| Param                  | Default  | Description                                                      |
| ---------------------- | -------- | ---------------------------------------------------------------- |
| `compound_leftovers`   | `"all"`  | `"all"` / `"none"` / `"token0"` / `"token1"`                     |
| `optimal_token0_ratio` | `500000` | Target token0 % (scaled by 1e6: 500000 = 50%)                    |
| `trigger_lower_ratio`  | `0`      | Trigger offset below lower tick (scaled by 1e6, 0 = at boundary) |
| `trigger_upper_ratio`  | `0`      | Trigger offset above upper tick (scaled by 1e6, 0 = at boundary) |
| `min_rebalance_time`   | `3600`   | Cooldown in seconds (1 hour)                                     |
| `max_rebalance_time`   | `1e12`   | Max time before forced rebalance (effectively disabled)          |

**Free rebalance quota (per owner across all accounts):**

| stAAA held | Daily | Weekly |
| ---------- | ----- | ------ |
| 0          | 1     | 3      |
| 3,000      | 2     | 10     |
| 6,000      | 3     | 17     |
| 9,000      | 4     | 24     |
| 30,000     | 11    | 73     |

Quota is bypassed when: gas cost < pending fees ÷ 2, or position value ≥ $50k.

**Pay for extra rebalances with AAA:** Deposit AAA tokens into the account, then approve them to the gas relayer `0xD938C8d04cF91094fecAF0A2018EAac483a40137`.

**Fees:** 7.5% of yield earned, max 1% liquidity decrease per rebalance (MDL).

**Range width and reposition mode** are configured in the Arcadia platform after enabling — not settable via MCP.

---

## Compounder

**What it does:** Claims accumulated LP fees and reinvests them back into the position.

**Tool:** `write.asset_managers.compounder`

**When to add on top of a rebalancer:** The rebalancer compounds at rebalance time. Adding a compounder also compounds between rebalances — more frequent compounding, higher effective APY.

---

## Compounder + CowSwap

**What it does:** Claims staked CL rewards (typically AERO), swaps them to a target token via CowSwap batch auctions (MEV-protected), then compounds into the LP position.

**Tool:** `write.asset_managers.compounder_staked`

**Params:**

- `sell_tokens`: typically `[AERO]` for staked positions
- `buy_token`: a major token in the pair (USDC, WETH, cbBTC)

Sets metadata on both CowSwapper and Compounder in one call. Base only.

---

## Yield Claimer

**What it does:** Periodically claims pending fees/emissions and sends them to a designated recipient.

**Tool:** `write.asset_managers.yield_claimer`

**Params:** `fee_recipient` — address to receive claimed fees.

---

## Yield Claimer + CowSwap

**What it does:** Claims LP fees, swaps claimed tokens to a target token via CowSwap, sends to recipient.

**Tool:** `write.asset_managers.yield_claimer_cowswap`

**Params:**

- `sell_tokens`: staked LP → `[AERO]`, non-staked → `[token0, token1]` minus buy_token
- `buy_token`: token to receive
- `fee_recipient`: destination address

Sets metadata on both CowSwapper and Yield Claimer. Base only.

---

## CoW Swapper (Direct)

**What it does:** Swap any ERC20 → ERC20 via CoW Protocol batch auctions (MEV-protected). Each swap requires account owner signature.

**Tool:** `write.asset_managers.cow_swapper`

Base only. Not coupled to any other automation.

---

## Merkl Operator

**What it does:** Claims external Merkl protocol incentive rewards into the account — additional rewards paid by token teams on top of regular LP fees.

**Tool:** `write.asset_managers.merkl_operator`

**When to enable:** When the pool has active Merkl campaigns (check APY breakdown in `read.strategy.list`).

**Always combine with rebalancer** when both are relevant — no conflict, extra free yield.
