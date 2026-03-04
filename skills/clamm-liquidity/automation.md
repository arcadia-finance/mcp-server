# Automation Setup

All automation on Arcadia uses one of two tools depending on your account version, then Arcadia's backend bots do the work.

## Which tool to use

**For V3/V4 accounts (recommended for new accounts):** Use `build_configure_asset_manager_tx`. This grants permission AND sets strategy parameters (initiator, fee limits, trigger thresholds, fee recipient, etc.) in a single transaction.

**For V1/V2 accounts (legacy):** Use `build_set_asset_manager_tx`. This only grants permission — strategy parameters must be configured separately in the Arcadia platform.

## Configure + enable (V3/V4)

```
build_configure_asset_manager_tx(
  account_address: <account>,
  asset_manager_address: <address from table below>,
  am_type: "rebalancer" | "compounder" | "yield_claimer" | "merkl_operator",
  // rebalancer-specific (all optional, shown with defaults):
  trigger_lower_ratio: 0,      // 0 = trigger exactly at boundary. Values scaled by 1e6 (must be integer): 50000 = 5%, 100000 = 10%
  trigger_upper_ratio: 0,      // same as above for the upper bound
  compound_leftovers: "all",   // "all" = compound both tokens, "none" = don't compound, "token0" or "token1" = compound only that token
  min_rebalance_time: 3600,    // 1 hour cooldown between rebalances
  // yield_claimer / merkl_operator:
  fee_recipient: <address>,    // required for yield_claimer
  reward_recipient: <address>, // required for merkl_operator
  chain_id: 8453
)
// Note: initiator address and fee limits are set automatically by the tool based on am_type — no need to pass them.

```

## Grant only (V1/V2)

```
build_set_asset_manager_tx(
  account_address: <account>,
  asset_manager_address: <address from table below>,
  enabled: true,      // false to revoke
  chain_id: 8453
)
```

To revoke any AM: `build_set_asset_manager_tx(..., enabled: false)` or `build_configure_asset_manager_tx` is not used for revocation — use `build_set_asset_manager_tx` with `enabled: false`.

---

## Rebalancer

**What it does:** When the LP position goes out of range, Arcadia's bot repositions it to a new range centered on the current price. As part of every rebalance, the old position is burned and all pending fees and staking rewards are claimed — these are automatically compounded into the new position. The rebalancer therefore also acts as a compounder at every rebalance event.

**Which address:** Match to your LP protocol (Base):

| Protocol                | Address                                      |
| ----------------------- | -------------------------------------------- |
| Aerodrome Slipstream V1 | `0x5802454749cc0c4A6F28D5001B4cD84432e2b79F` |
| Aerodrome Slipstream V2 | `0x953Ff365d0b562ceC658dc46B394E9282338d9Ea` |
| Uniswap V3              | `0xbA1D0c99c261F94b9C8b52465890Cca27dd993Bd` |
| Uniswap V4              | `0x01EDaF0067a10D18c88D2876c0A85Ee0096a5Ac0` |

**Free rebalance quota (per owner across all accounts):**

| stAAA held | Daily | Weekly |
| ---------- | ----- | ------ |
| 0          | 1     | 3      |
| 3,000      | 2     | 10     |
| 6,000      | 3     | 17     |
| 9,000      | 4     | 24     |
| 30,000     | 11    | 73     |

Quota is also bypassed automatically when: gas cost < pending fees ÷ 2, or position value ≥ $50k.

**Pay for extra rebalances with AAA:** Deposit AAA tokens into the account, then approve them to the gas relayer `0xD938C8d04cF91094fecAF0A2018EAac483a40137`. Each rebalance consumes AAA proportional to gas cost.

**Fees:** 7.5% of yield earned, max 1% liquidity decrease per rebalance (MDL).

**`strategy_hook`** (optional): For POL, pass `strategy_hook: "0xed332137b463D98868132791EC3f641c8eE3bE71"` to use the dynamic range algorithm. Omit for standard rebalancer behavior.

**Strategy config:** Range width and reposition mode are configured in the Arcadia platform after enabling the rebalancer — not settable via MCP.

---

## Compounder

**What it does:** Bot claims accumulated LP fees and reinvests them back into the position (compound interest instead of cash flow).

**Which address (Base):**

| Protocol                | Address                                      |
| ----------------------- | -------------------------------------------- |
| Aerodrome Slipstream V1 | `0x467837f44A71e3eAB90AEcfC995c84DC6B3cfCF7` |
| Aerodrome Slipstream V2 | `0x35e59448C7145482E56212510cC689612AB4F61f` |
| Uniswap V3              | `0x02e1fa043214E51eDf1F0478c6D0d3D5658a2DC3` |
| Uniswap V4              | `0xAA95c9c402b195D8690eCaea2341a76e3266B189` |

**When to add a compounder on top of a rebalancer:** The rebalancer compounds fees at rebalance time. Adding a compounder also compounds fees between rebalances — more frequent compounding, higher effective APY.

---

## Yield Claimer

**What it does:** Bot periodically claims pending fees/emissions and sends them to a designated recipient (owner wallet, another account, or any address).

**Which address (Base):**

| Protocol                | Address                                      |
| ----------------------- | -------------------------------------------- |
| Aerodrome Slipstream V1 | `0x5a8278D37b7a787574b6Aa7E18d8C02D994f18Ba` |
| Aerodrome Slipstream V2 | `0xc8bF4B2c740FF665864E9494832520f18822871C` |
| Uniswap V3              | `0x75Ed28EA8601Ce9F5FbcAB1c2428f04A57aFaA16` |
| Uniswap V4              | `0xD8aa21AB7f9B8601CB7d7A776D3AFA1602d5D8D4` |

**Recipient config:** Set `fee_recipient` in `build_configure_asset_manager_tx` (V3/V4 accounts). Pass your wallet address or any destination address.

---

## Merkl Operator

**What it does:** Bot claims external Merkl protocol incentive rewards into the account. These are additional rewards paid by token teams on top of regular LP fees — completely separate from trading fee yield.

**When to enable:** When the pool you LP into has active Merkl campaigns. Check by looking at the pool APY breakdown in `get_strategies` — if there's a "Merkl" or "external rewards" component, enable this.

**Address:**

**Address (all chains):** `0x969F0251360b9Cf11c68f6Ce9587924c1B8b42C6`

**Always combine with rebalancer** when both are relevant — no conflict, extra free yield.

---

## CoW Swapper

**What it does:** Bot places CoW Protocol batch auction swap orders to sell tokens accumulated in the account (e.g., claimed AERO emissions → USDC). Uses MEV-protected execution via CoW's batch auction mechanism.

**Address (Base):** `0xc928013A219EC9F18dE7B2dee6A50Ba626811854`

**Config:** Which tokens to sell and what to buy is configured in the Arcadia platform — not settable via MCP.

**Use case:** When using a yield claimer to collect emissions in a volatile token, pair it with the CoW Swapper to automatically convert those tokens into a stablecoin or preferred asset.
