---
name: clamm-liquidity
description: Agent guide for clAMM management on Arcadia Finance. Covers 25 MCP tools (+1 dev), automation setup (rebalancers, compounders, yield claimers, Merkl, CoW swapper), strategy selection framework, and strategy templates including delta neutral leveraged LP and protocol-owned liquidity.
user-invocable: true
---

# Arcadia Finance — clAMM Agent Guide

Arcadia is a platform for managing concentrated liquidity positions — with built-in leverage, automated rebalancing, compounding, and yield optimization. Positions live in Arcadia accounts, which can also borrow against their collateral. This skill covers everything needed to manage clAMM positions as an agent.

## Key Constraints

- **All `write.*` tools return unsigned transactions** (`{ to, data, value, chainId }`) — you must sign and broadcast them. See "Transaction Signing" below.
- **Automation strategy config** (tick range, rebalance thresholds) is not currently settable via MCP — this requires Arcadia platform access.
- **Health factor** = `1 - (used_margin / liquidation_value)`. Higher is safer. `1` = no debt, `>0` = healthy, `0` = liquidation threshold, `<0` = past liquidation. Keep above 0.5 for leveraged positions; act immediately below 0.2.
- **Minimum margin** — each lending pool enforces a fixed minimum margin denominated in the pool's numeraire (e.g. WETH for the WETH pool, USDC for the USDC pool), typically a few dollars in value. This gets **added to the debt** when computing `used_margin` (i.e. `used_margin = open_debt + minimum_margin`). It ensures liquidations remain profitable (covering gas costs) and prevents dust attacks. For small positions the fixed minimum margin dominates the used margin, pushing health factor lower than the leverage ratio alone would suggest (e.g. HF ~0.3 at 2× leverage). Increase position size for a healthier starting HF. `write.account.add_liquidity` also validates deposits against per-asset minimum amounts from strategy risk factors.

## Transaction Signing

Write tools (`write.*`) return unsigned transaction calldata. This server does NOT sign or broadcast. After receiving a transaction object, you must:

1. **Sign** the transaction with the account owner's private key or wallet
2. **Broadcast** it to the appropriate chain (Base 8453 or Unichain 130)
3. **Wait** for the transaction receipt to confirm success

How you sign depends on your setup:

- **MPC wallet** (Fireblocks, Dfns, Turnkey) — pass the unsigned tx to your provider's signing API
- **Smart account** (Safe, Biconomy) — wrap the tx as a UserOperation or Safe transaction
- **Embedded wallet** (Privy, Dynamic) — use the provider's `sendTransaction` method
- **Direct private key** (development only) — use the built-in `dev.send` tool (set `PK` in a `.env` file or MCP client config), or viem/ethers `sendTransaction` with a local signer

Example with viem:

```typescript
const hash = await walletClient.sendTransaction(tx);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
```

## Batching Philosophy

Arcadia's flash-action tools can batch multiple DeFi operations into a single atomic transaction. **Always prefer batched tools** — they reduce transaction count, gas cost, and exposure to price movement between steps.

**When to split:** In high-volatility markets or for low-liquidity pools, batched transactions may revert because on-chain state changes between when the backend computes calldata and when the transaction executes. If a batched tool fails, fall back to individual tools with tighter slippage. Always try batched first, split only on failure.

**Batched write tools (`write.account.add_liquidity`, `write.account.close`, `write.account.deleverage`, `write.account.swap`, `write.account.remove_liquidity`, `write.account.stake`) return time-sensitive calldata** — sign and broadcast promptly; calldata may expire after 30–60 seconds depending on market conditions. If a transaction reverts due to price movement, rebuild and retry at least once before falling back to individual tools.

## MCP Tools (25 + 1 dev)

### Read Tools

| Tool                           | When to use                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read.account.info`            | Account overview + liquidation price. Pass `account_address` for detail (returns positions with `asset_address`/`asset_id`, collateral, debt) or `wallet_address` to list accounts.                                                                                                                                                                   |
| `read.account.history`         | Historical account value over time. Optional `days` param (default 14).                                                                                                                                                                                                                                                                               |
| `read.account.pnl`             | PnL and yield earned — use to check if a strategy is still profitable.                                                                                                                                                                                                                                                                                |
| `read.assets`                  | Supported collateral assets with prices. Pass `asset_addresses` (single or comma-separated) for price lookup.                                                                                                                                                                                                                                         |
| `read.wallet.balances`         | On-chain ERC20 balances and native ETH for a wallet. Use to pre-check if the wallet has enough tokens before depositing or adding liquidity.                                                                                                                                                                                                          |
| `read.wallet.allowance`        | Check ERC20 token allowances for a spender. Use before `write.wallet.approve` to avoid redundant approvals — skip if the current allowance is already sufficient.                                                                                                                                                                                     |
| `read.pools`                   | Pool TVL, APY, utilization, liquidity. Pass `pool_address` for detail + APY history (optional `days`, default 14).                                                                                                                                                                                                                                    |
| `read.strategy.list`           | LP strategies with fee APY, underlyings, pool protocol. List view shows 7d avg APY for the strategy's default range (e.g. ±7.5% for volatile pairs). **Pass `strategy_id` to see APY per range width** (very_narrow → full_range) — narrower range = higher APY but more rebalancing cost/risk. Use `featured_only: true` for curated top strategies. |
| `read.points`                  | Points for a wallet or leaderboard. No `chain_id` needed — points are cross-chain.                                                                                                                                                                                                                                                                    |
| `read.strategy.recommendation` | Rebalancing recommendation for an account. Uses 1d APY (not 7d like `read.strategy.list`), so numbers may differ.                                                                                                                                                                                                                                     |
| `read.guides`                  | Reference guides: `automation` (AM setup), `selection` (pool evaluation), `strategies` (step-by-step templates).                                                                                                                                                                                                                                      |

### Preferred Write Tools (atomic/multi-step — use these first)

These tools batch multiple operations into ONE atomic transaction. Always prefer these over individual tools.

| Tool                               | Batches                                            | When to use                                                                                                     |
| ---------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `write.account.add_liquidity`      | deposit + swap + mint LP + optional borrow         | Open LP position. Do NOT call `write.account.deposit` separately — this handles wallet transfer atomically.     |
| `write.account.close`              | burn LP + swap + repay debt (up to 3 steps)        | Close/exit a position. ALWAYS try this first. Tokens stay in account — follow up with `write.account.withdraw`. |
| `write.account.deleverage`         | swap collateral + repay debt                       | Repay debt using account collateral (no wallet tokens needed). Preferred for health factor fixes.               |
| `write.account.set_asset_managers` | build setAssetManagers tx from encoded intent args | Combine multiple automations by merging arrays from `write.asset_managers.*` intent tools.                      |

### Individual Write Tools (use when batched tools fail or for standalone operations)

| Tool                             | When to use                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `write.wallet.approve`           | Approve a token for spending. **Required before `write.account.deposit`** and before `write.account.add_liquidity` (when depositing from wallet). Call `read.wallet.allowance` first to check if already approved. |
| `write.account.create`           | Create a new Arcadia account (one-time setup). Use `account_version: 0` for the latest version (recommended).                                                                                                      |
| `write.account.deposit`          | Deposit ERC20 tokens as collateral. NOT needed before `write.account.add_liquidity` — that tool handles deposits atomically.                                                                                       |
| `write.account.withdraw`         | Withdraw assets to account owner. Account version auto-detected on-chain. Params: `asset_addresses[]`, `asset_amounts[]` (exact amounts, no max_uint256), optional `asset_ids[]` (0 for ERC20).                    |
| `write.account.borrow`           | Borrow from a lending pool. NOT needed for leveraged LP — `write.account.add_liquidity` handles borrowing internally.                                                                                              |
| `write.account.repay`            | Repay debt from wallet (approve pool first). Use `amount: "max_uint256"` to repay in full. For repaying with account collateral, prefer `write.account.deleverage`.                                                |
| `write.account.swap`             | Swap assets within account (backend handles routing). For closing positions, prefer `write.account.close`.                                                                                                         |
| `write.account.remove_liquidity` | PARTIAL liquidity decrease only (position stays open). For full LP removal/exit, use `write.account.close`.                                                                                                        |
| `write.account.stake`            | Stake, unstake, or claim rewards for an LP position. Direction auto-detected from `asset_address`.                                                                                                                 |
| `read.asset_managers.intents`    | List available automations with tool names, required params, and supported chains. Use to discover what automations can be configured.                                                                             |

### Dev Tools (only available when `PK` env var is set)

| Tool       | When to use                                                                                                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev.send` | Sign and broadcast an unsigned transaction using a local private key. Pass the `{ to, data, value, chainId }` from any `write.*` tool. **Not for production** — use a dedicated wallet MCP server (Fireblocks, Safe, Turnkey, etc.) instead. |

## Token Addresses (Base 8453)

| Token | Address                                      | Decimals |
| ----- | -------------------------------------------- | -------- |
| WETH  | `0x4200000000000000000000000000000000000006` | 18       |
| USDC  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6        |
| cbBTC | `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` | 8        |
| AERO  | `0x940181a94A35A4569E4529A3CDfB74e38FD98631` | 18       |
| AAA   | `0xaaa843fb2916c0B57454270418E121C626402AAa` | 18       |
| stAAA | `0xDeA1531d8a1505785eb517C7A28526443df223F3` | 18       |

**Wrapping ETH:** ETH must be wrapped to WETH before depositing. Call WETH's `deposit()` function (payable) with the ETH amount. No MCP tool for this — use your wallet.

## Contract Addresses (Base 8453)

| Contract | Address                                      |
| -------- | -------------------------------------------- |
| Factory  | `0xDa14Fdd72345c4d2511357214c5B89A919768e59` |

**`asset_id`** is always an integer (NFT token ID for LP positions, 0 for ERC20 tokens).

## Lending Pool Addresses (Base 8453)

Use as `pool_address` in `write.account.borrow` / `write.account.repay`, as `creditor` in `write.account.create` / `write.account.deleverage`:

| Asset | Pool Address                                 |
| ----- | -------------------------------------------- |
| WETH  | `0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2` |
| USDC  | `0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1` |
| cbBTC | `0xa37E9b4369dc20940009030BfbC2088F09645e3B` |

## Asset Manager Addresses (Base 8453)

Addresses are auto-resolved by `write.asset_managers.*` intent tools based on `pool_protocol`. Listed here for reference. All require V3/V4 accounts.

| Type           | Protocol      | Address                                      |
| -------------- | ------------- | -------------------------------------------- |
| Rebalancer     | Slipstream V1 | `0x5802454749cc0c4A6F28D5001B4cD84432e2b79F` |
| Rebalancer     | Slipstream V2 | `0x953Ff365d0b562ceC658dc46B394E9282338d9Ea` |
| Rebalancer     | Uniswap V3    | `0xbA1D0c99c261F94b9C8b52465890Cca27dd993Bd` |
| Rebalancer     | Uniswap V4    | `0x01EDaF0067a10D18c88D2876c0A85Ee0096a5Ac0` |
| Compounder     | Slipstream V1 | `0x467837f44A71e3eAB90AEcfC995c84DC6B3cfCF7` |
| Compounder     | Slipstream V2 | `0x35e59448C7145482E56212510cC689612AB4F61f` |
| Compounder     | Uniswap V3    | `0x02e1fa043214E51eDf1F0478c6D0d3D5658a2DC3` |
| Compounder     | Uniswap V4    | `0xAA95c9c402b195D8690eCaea2341a76e3266B189` |
| Yield Claimer  | Slipstream V1 | `0x5a8278D37b7a787574b6Aa7E18d8C02D994f18Ba` |
| Yield Claimer  | Slipstream V2 | `0xc8bF4B2c740FF665864E9494832520f18822871C` |
| Yield Claimer  | Uniswap V3    | `0x75Ed28EA8601Ce9F5FbcAB1c2428f04A57aFaA16` |
| Yield Claimer  | Uniswap V4    | `0xD8aa21AB7f9B8601CB7d7A776D3AFA1602d5D8D4` |
| Merkl Operator | All           | `0x969F0251360b9Cf11c68f6Ce9587924c1B8b42C6` |
| CoW Swapper    | All           | `0xc928013A219EC9F18dE7B2dee6A50Ba626811854` |
| Gas Relayer    | All           | `0xD938C8d04cF91094fecAF0A2018EAac483a40137` |

**Slipstream V1 vs V2:** The pool determines the version — some pools are V1, some are V2. The API currently returns `protocol: "slipstream"` without V1/V2 distinction. To identify the version, check the position manager address from `read.account.info` against the known addresses (V1: `0x8279...`, V2: `0xa990...`). Alternatively, pass `pool_protocol` directly to `write.asset_managers.*` intent tools to auto-resolve the correct AM address. Staked and wrapped staked positions use the same asset managers as their base protocol.

## Account Versions

Spot vs margin is determined by whether a **creditor** (lending pool) is set at account creation, not by version number.

- `account_version: 3` — **margin account** (created with a `creditor`). Can borrow, leverage, and mint LP. Uses an onchain whitelist of allowed collateral tokens.
- `account_version: 4` or `0` (latest) — **spot account** (no creditor, no borrowing). Can hold assets and mint LP with `leverage: 0`. Accepts any ERC20 (no onchain whitelist).
- `account_version: 1` or `2` — legacy. Not supported by current MCP tools (`write.asset_managers.*` and `write.account.set_asset_managers` require V3/V4).
- For **leveraged LP strategies**, use `account_version: 3` with a creditor.
- To check an existing account's version: call `read.account.info` — the response includes the account version.

## Reference Files

- [automation.md](automation.md) — How to enable each automation type
- [selection.md](selection.md) — How to evaluate pools, choose range width, size leverage, combine automation
- [strategies.md](strategies.md) — Step-by-step strategy templates: delta neutral LP and protocol-owned liquidity
