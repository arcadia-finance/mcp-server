---
name: clamm-liquidity
description: Agent guide for clAMM management on Arcadia Finance. Covers 22 MCP tools, automation setup (rebalancers, compounders, yield claimers, Merkl, CoW swapper), strategy selection framework, and strategy templates including delta neutral leveraged LP and protocol-owned liquidity.
user-invokable: true
---

# Arcadia Finance — clAMM Agent Guide

Arcadia lets you deposit LP positions as collateral, borrow against them, and automate management via asset manager contracts. This skill covers everything needed to manage clAMM positions as an agent.

## Key Constraints

- **All tools return transaction calldata** — sign and submit using the account owner's key or wallet.
- **Automation strategy config** (tick range, rebalance thresholds) is not currently settable via MCP — this requires Arcadia platform access.
- **Health factor must stay > 1.0** — accounts below 1.0 get liquidated. Target > 1.3 buffer for leveraged positions.

## MCP Tools (22)

### Read Tools

| Tool                  | When to use                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_account_info`    | Account overview + liquidation price. Pass `account_address` for detail (returns positions with `asset_address`/`asset_id`, collateral, debt) or `wallet_address` to list accounts. |
| `get_account_history` | Historical account value over time. Optional `days` param (default 14).                                                                                                             |
| `get_account_pnl`     | PnL and yield earned — use to check if a strategy is still profitable.                                                                                                              |
| `get_assets`          | Supported collateral assets with prices. Pass `asset_addresses` (single or comma-separated) for price lookup.                                                                       |
| `get_lending_pools`   | Pool TVL, APY, utilization, liquidity. Pass `pool_address` for detail + APY history (optional `days`, default 14).                                                                  |
| `get_strategies`      | LP strategies with fee APY, underlyings, pool protocol. Pass `strategy_id` for detail or `featured_only: true`.                                                                     |
| `get_protocol_stats`  | Protocol-wide TVL, borrowed, pool count, AAA supply.                                                                                                                                |
| `get_points`          | Points for a wallet or leaderboard. No `chain_id` needed — points are cross-chain.                                                                                                  |
| `get_recommendation`  | Rebalancing recommendation for an account.                                                                                                                                          |

### Write Tools (direct calldata)

| Tool                               | When to use                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build_approve_tx`                 | Approve a token for spending. **Required before `build_deposit_tx`** — the account must be approved to pull tokens from your wallet.                                      |
| `build_create_account_tx`          | Create a new Arcadia account (one-time setup). Use `account_version: 0` for the latest version (recommended).                                                             |
| `build_deposit_tx`                 | Deposit ERC20 tokens as collateral. Approve first with `build_approve_tx`.                                                                                                |
| `build_withdraw_tx`                | Withdraw assets to account owner. Params: `asset_addresses[]`, `asset_amounts[]` (exact amounts, no max_uint256), optional `asset_ids[]` (0 for ERC20).                   |
| `build_borrow_tx`                  | Borrow from a lending pool. Params: `pool_address`, `account_address`, `amount`, `to` (address to receive borrowed tokens).                                               |
| `build_repay_tx`                   | Repay debt from wallet (approve pool first). Use `amount: "max_uint256"` to repay in full.                                                                                |
| `build_set_asset_manager_tx`       | Grant/revoke an AM on any account version. For V3/V4, use `build_configure_asset_manager_tx` to enable WITH config; this tool to revoke.                                  |
| `build_configure_asset_manager_tx` | Enable AND configure an AM in one tx (V3/V4). `am_type`: `"rebalancer"`, `"compounder"`, `"yield_claimer"`, `"merkl_operator"`. Sets initiator/fees/params automatically. |

### Advanced Tools (via backend API)

| Tool                             | When to use                                                                                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build_add_liquidity_tx`         | Open LP position: atomic deposit + swap + mint + optional leverage.                                                                                                                                                   |
| `build_remove_liquidity_tx`      | Decrease LP liquidity. Params: `account_address`, `asset_address` (position manager), `asset_id` (NFT token ID), `adjustment` (raw liquidity amount as string — use the position's total liquidity for full removal). |
| `build_swap_tx`                  | Swap assets within account (backend handles routing).                                                                                                                                                                 |
| `build_repay_with_collateral_tx` | Repay debt by selling account collateral (atomic swap + repay).                                                                                                                                                       |
| `build_position_action_tx`       | All actions require `account_address`, `asset_address`, `asset_id`, `chain_id`. Stake/unstake direction auto-detected from `asset_address`: pass non-staked PM to stake, staked PM to unstake.                        |

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

Use with `build_borrow_tx` and `build_repay_tx` as `pool_address`:

| Asset | Pool Address                                 |
| ----- | -------------------------------------------- |
| WETH  | `0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2` |
| USDC  | `0x3ec4a293Fb906DD2Cd440c20dECB250DeF141dF1` |
| cbBTC | `0xa37E9b4369dc20940009030BfbC2088F09645e3B` |

## Asset Manager Addresses (Base 8453)

Use with `build_configure_asset_manager_tx` (V3/V4 accounts) or `build_set_asset_manager_tx` (V1/V2 accounts).

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

**Slipstream V1 vs V2:** The pool determines the version — some pools are V1, some are V2. Check via `get_strategies` — the `pool_protocol` field identifies the version. Use the matching asset manager address from the table above.

## Account Versions

- `account_version: 0` — creates the **latest version** (currently V4). Recommended for new accounts.
- `account_version: 3` — **margin account.** No leverage, but uses an onchain whitelist of allowed collateral tokens.
- `account_version: 4` — **spot account.** Accepts any ERC20 (no onchain whitelist), but limited in practice to tokens the protocol can process.
- `account_version: 1` or `2` — legacy predecessors of V3/V4. Use `build_set_asset_manager_tx` instead of `build_configure_asset_manager_tx`.
- V3/V4 required for `build_configure_asset_manager_tx`.
- To check an existing account's version: call `get_account_info` — the response includes the account version.

## Reference Files

- [automation.md](automation.md) — How to enable each automation type
- [selection.md](selection.md) — How to evaluate pools, choose range width, size leverage, combine automation
- [strategies.md](strategies.md) — Step-by-step strategy templates: delta neutral LP and protocol-owned liquidity
