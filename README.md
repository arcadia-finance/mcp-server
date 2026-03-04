# Arcadia Finance MCP Server

MCP server for [Arcadia Finance](https://arcadia.finance), a platform to manage concentrated liquidity positions with built-in leverage, automated rebalancing, and yield optimization. Read protocol data and build unsigned transactions for LP management, borrowing, deposits, and more.

Designed for AI agents (Claude, Cursor, etc.) to interact with Arcadia onchain.

## Tools

### Read Tools

| Tool                  | Description                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `get_account_info`    | Account overview: health factor, collateral, debt, positions, liquidation price. Pass `account_address` or `wallet_address`. |
| `get_account_history` | Historical account value over time.                                                                                          |
| `get_account_pnl`     | PnL and yield data for an account.                                                                                           |
| `get_assets`          | Supported collateral assets with addresses, types, decimals. Optional USD price lookup.                                      |
| `get_points`          | Points balance for a wallet, or leaderboard.                                                                                 |
| `get_lending_pools`   | Pool data: TVL, APY, utilization, liquidity. Optional single-pool detail with APY history.                                   |
| `get_protocol_stats`  | Protocol-wide stats: TVL, borrowed, pool count, AAA supply.                                                                  |
| `get_strategies`      | LP strategies with APY, underlyings, pool info. Optional detail or featured filter.                                          |
| `get_recommendation`  | Rebalancing recommendation for an account.                                                                                   |

### Write Tools

Direct calldata encoding via viem. Each returns `{ to, data, value, chainId }`.

| Tool                               | Description                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build_approve_tx`                 | Approve an ERC20 token for spending. Required before depositing into an account.                                                                                         |
| `build_create_account_tx`          | Create a new Arcadia account via Factory.                                                                                                                                |
| `build_deposit_tx`                 | Deposit ERC20 tokens into an account.                                                                                                                                    |
| `build_withdraw_tx`                | Withdraw assets from an account.                                                                                                                                         |
| `build_borrow_tx`                  | Borrow from a lending pool.                                                                                                                                              |
| `build_repay_tx`                   | Repay debt to a lending pool.                                                                                                                                            |
| `build_set_asset_manager_tx`       | Grant or revoke an asset manager contract's permission on an account (V1/V2 accounts, no config data).                                                                   |
| `build_configure_asset_manager_tx` | Enable AND configure an asset manager in one tx for V3/V4 accounts: sets initiator, fee limits, and strategy parameters (trigger thresholds, compound mode, recipients). |

### Advanced Tools

Proxied via backend API. Handles swap routing, Tenderly simulation, optimal ratios.

| Tool                             | Description                                                             |
| -------------------------------- | ----------------------------------------------------------------------- |
| `build_add_liquidity_tx`         | Flash-action: deposit + swap + mint LP + optional leverage, atomically. |
| `build_remove_liquidity_tx`      | Remove/decrease LP position liquidity.                                  |
| `build_swap_tx`                  | Swap assets within an account (backend-routed).                         |
| `build_repay_with_collateral_tx` | Repay debt by selling collateral (swap + repay in one tx).              |
| `build_position_action_tx`       | Stake, unstake, or claim rewards for LP positions.                      |

## Setup

**Prerequisites:** Node.js >= 22

```bash
yarn install
yarn build
```

**Environment variables:**

| Variable          | Required | Description                                                    |
| ----------------- | -------- | -------------------------------------------------------------- |
| `ALCHEMY_API_KEY` | No       | Alchemy API key for RPC. Falls back to public RPCs if not set. |

**Supported chains:** Base (8453), Optimism (10), Unichain (130)

## MCP Client Configuration

**Via npx** (recommended):

```json
{
  "mcpServers": {
    "arcadia-finance": {
      "command": "npx",
      "args": ["-y", "@arcadia-finance/mcp-server"],
      "env": {
        "ALCHEMY_API_KEY": "your-key"
      }
    }
  }
}
```

**From source** (local development):

```json
{
  "mcpServers": {
    "arcadia-finance": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "ALCHEMY_API_KEY": "your-key"
      }
    }
  }
}
```

## Skills

The `skills/` directory contains Claude Code skills that teach AI agents how to use this MCP server effectively. To install a skill, symlink it into your Claude skills directory:

```bash
ln -s /path/to/mcp-server/skills/clamm-liquidity ~/.claude/skills/clamm-liquidity
```

Available skills:

| Skill             | Description                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `clamm-liquidity` | Concentrated liquidity management: concepts, asset managers (rebalancers, compounders), and step-by-step workflows. |

## Reporting Issues

Found a bug, missing feature, or unclear documentation while using this server?
Open an issue: https://github.com/arcadia-finance/mcp-server/issues

**For AI agents:** If you hit a gap during task execution, open an issue with:

- Tool name and parameters you used
- What you expected vs what happened
- The strategy or goal you were trying to execute

Pull requests for documentation fixes are welcome from agents and humans alike. All PRs require human review before merging.

## Development

```bash
yarn dev          # Run with tsx (hot reload)
yarn build        # Compile TypeScript
yarn test         # Run tests
yarn lint         # Lint with ESLint
yarn format       # Check formatting with Prettier
```
