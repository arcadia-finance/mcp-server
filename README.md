# Arcadia Finance MCP Server

[![npm](https://img.shields.io/npm/v/@arcadia-finance/mcp-server)](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@arcadia-finance/mcp-server)](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2025--11--25-green)](https://modelcontextprotocol.io/)
[![Smithery](https://img.shields.io/badge/Smithery-listed-6b46c1)](https://smithery.ai/servers/arcadia-finance/mcp-server)
[![MCP Badge](https://lobehub.com/badge/mcp/arcadia-finance-mcp-server)](https://lobehub.com/mcp/arcadia-finance-mcp-server)
[![arcadia-finance-mcp-server MCP server](https://glama.ai/mcp/servers/arcadia-finance/mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/arcadia-finance/mcp-server)

MCP server for [Arcadia Finance](https://arcadia.finance), a platform for concentrated liquidity on Uniswap and Aero with automated rebalancing, compounding, yield optimization, and leverage, or single-sided liquidity into lending pools. Read protocol data and build unsigned transactions for LP management, borrowing, deposits, and more.

Designed for AI agents (Claude, Cursor, etc.) to interact with Arcadia onchain.

## Install

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0078d4?logo=visualstudiocode)](https://vscode.dev/redirect/mcp/install?name=arcadia-finance&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40arcadia-finance%2Fmcp-server%22%5D%7D)
[![Install in Cursor](https://img.shields.io/badge/Cursor-Install_Server-black?logo=cursor)](https://cursor.com/en/install-mcp?name=arcadia-finance&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBhcmNhZGlhLWZpbmFuY2UvbWNwLXNlcnZlciJdfQ==)

## Tools

### Read Tools

| Tool                           | Description                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `read_account_info`            | Account overview: health factor, collateral, debt, positions, liquidation price, automation status.         |
| `read_account_history`         | Historical account value over time.                                                                         |
| `read_account_pnl`             | PnL and yield data for an account.                                                                          |
| `read_wallet_accounts`         | List all Arcadia accounts owned by a wallet address.                                                        |
| `read_account_aero_upgrade`    | What a wallet's accounts (or one account) have to upgrade to Aero: status and counts, no calldata.          |
| `read_wallet_balances`         | On-chain ERC20 balances and native ETH for a wallet address.                                                |
| `read_wallet_allowances`       | Check ERC20 token allowances for a spender. Use before `write_wallet_approve` to avoid redundant approvals. |
| `read_wallet_points`           | Points balance for a specific wallet address.                                                               |
| `read_asset_list`              | Supported collateral assets with addresses, types, decimals.                                                |
| `read_asset_prices`            | USD prices for one or more asset addresses.                                                                 |
| `read_pool_list`               | All lending pools: TVL, APY, utilization, liquidity.                                                        |
| `read_pool_info`               | Single pool detail with APY history over time.                                                              |
| `read_point_leaderboard`       | Paginated Arcadia points leaderboard.                                                                       |
| `read_strategy_list`           | LP strategies with APY, underlyings, pool info. Supports featured filter and pagination.                    |
| `read_strategy_info`           | Full detail for a specific LP strategy: APY per range width, pool config.                                   |
| `read_strategy_recommendation` | Rebalancing recommendation for an account.                                                                  |
| `read_guides`                  | Reference guides: automation setup, strategy selection, strategy templates.                                 |
| `read_asset_manager_intents`   | Automation intents and their params; add `account_address` for live per-account availability.               |
| `read_asset_manager_current`   | Automations enabled on an account: decoded config, mapped intents, Merkl state, superseded managers.        |

### Write Tools

All write tools return unsigned transactions as `{ to, data, value, chainId }`.

| Tool                              | Description                                                                                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write_wallet_approve`            | Approve an ERC20 token for spending. Required before depositing into an account. Call `read_wallet_allowances` first to check if already approved. |
| `write_wallet_upgrade_velo`       | Upgrade wallet VELO on Optimism to the new AERO on Base (approve, then the payable deposit).                                                       |
| `write_pool_deposit`              | Lend the pool's underlying asset into an ERC-4626 tranche to earn interest. Mints tranche shares to the receiver.                                  |
| `write_pool_redeem`               | Redeem tranche shares back into the underlying asset (lender exit).                                                                                |
| `write_account_create`            | Create a new Arcadia account via Factory.                                                                                                          |
| `write_account_deposit`           | Deposit ERC20 tokens into an account.                                                                                                              |
| `write_account_withdraw`          | Withdraw assets from an account.                                                                                                                   |
| `write_account_borrow`            | Borrow from a lending pool.                                                                                                                        |
| `write_account_repay`             | Repay debt to a lending pool from wallet.                                                                                                          |
| `write_account_add_liquidity`     | Flash-action: deposit + swap + mint LP + optional leverage, atomically.                                                                            |
| `write_account_remove_liquidity`  | Remove/decrease LP position liquidity.                                                                                                             |
| `write_account_swap`              | Swap assets within an account (backend-routed).                                                                                                    |
| `write_account_deleverage`        | Repay debt by selling collateral (swap + repay in one tx).                                                                                         |
| `write_account_close`             | Atomic close: burn LP + swap + repay debt in one tx.                                                                                               |
| `write_account_stake`             | Stake, unstake, or claim rewards for LP positions.                                                                                                 |
| `write_account_aero_upgrade`      | Upgrade an account to Aero: its Slipstream positions move to Aero CL and its old AERO becomes the new AERO, in one flashAction.                    |
| `write_account_automations`       | Configure automations from an intents array (full desired state). Returns the unsigned setAssetManagers tx.                                        |
| `write_account_automations_delta` | Enable/disable individual automations, leaving the rest untouched.                                                                                 |

### Dev Tools

Always registered but requires `PK` env var to function.

| Tool       | Description                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev_send` | Sign and broadcast an unsigned transaction using a local private key (`PK` env var). Not for production: use a dedicated wallet MCP server instead. |

## Transaction Signing

All write tools return **unsigned transactions** as `{ to, data, value, chainId }`. This server does NOT sign or broadcast — your agent or application is responsible for that.

### Options

**Wallet MCP servers (recommended for production):**
Pair this server with a wallet MCP server that handles signing:

| Wallet MCP                                                        | Provider  | Model                                                     |
| ----------------------------------------------------------------- | --------- | --------------------------------------------------------- |
| [MCP Wallet Signer](https://github.com/nikicat/mcp-wallet-signer) | Community | Non-custodial, routes to browser wallet (MetaMask, Rabby) |
| [Coinbase AgentKit](https://github.com/coinbase/agentkit)         | Coinbase  | Wallet-agnostic, supports multiple providers              |
| [Phantom MCP](https://www.npmjs.com/package/@phantom/mcp-server)  | Phantom   | Embedded wallet                                           |
| [Privy MCP](https://github.com/incentivai-io/privy-mcp-server)    | Privy     | Wallet infrastructure                                     |
| [Safe MCP](https://github.com/safer-sh/safer)                     | Community | Multi-sig via Safe                                        |

Or use your existing wallet setup (Fireblocks, Dfns, Turnkey, Biconomy, Dynamic) and pass the unsigned tx object to your provider's signing method.

**viem/ethers in your agent:**

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const account = privateKeyToAccount("0x...");
const client = createWalletClient({ account, chain: base, transport: http() });

// tx = result from any write_* tool
const hash = await client.sendTransaction(tx);
```

**Built-in `dev_send` tool (development only):**
The server includes a dev-only signing tool that reads a private key from the `PK` environment variable. Set `PK` via a `.env` file or your MCP client config:

```bash
# .env in the server directory (never commit — already gitignored)
PK=0xYourPrivateKeyHex
RPC_URL_BASE=https://base-mainnet.g.alchemy.com/v2/your-key
```

The server loads `.env` automatically on startup. Works with any MCP client (Claude Desktop, Claude Code, VSCode, Cursor). MCP client `env` block settings take precedence if both are set.

Not for production — use a dedicated wallet MCP server (Fireblocks, Turnkey, Safe) instead.

## Setup

**Prerequisites:** Node.js >= 22

```bash
yarn install
yarn build
```

**Environment variables:**

| Variable            | Required | Default                       | Transport | Description                                                    |
| ------------------- | -------- | ----------------------------- | --------- | -------------------------------------------------------------- |
| `RPC_URL_BASE`      | No       | Public RPC                    | Both      | RPC URL for Base (8453).                                       |
| `RPC_URL_UNICHAIN`  | No       | Public RPC                    | Both      | RPC URL for Unichain (130).                                    |
| `RPC_URL_OPTIMISM`  | No       | Public RPC                    | Both      | RPC URL for Optimism (10).                                     |
| `RPC_URL_ROBINHOOD` | No       | Public RPC                    | Both      | RPC URL for Robinhood (4663).                                  |
| `PK`                | No       | none                          | Both      | Private key (hex) for dev-only `dev_send` tool.                |
| `TRANSPORT`         | No       | `stdio`                       | —         | Transport mode: `stdio` or `http`.                             |
| `PORT`              | No       | `3000`                        | HTTP      | Listen port for HTTP transport.                                |
| `ALLOWED_ORIGINS`   | No       | `https://mcp.arcadia.finance` | HTTP      | Comma-separated allowed Origin headers (CORS / DNS rebinding). |
| `RATE_LIMIT_RPM`    | No       | `600`                         | HTTP      | Max requests per minute per client IP.                         |
| `POSTHOG_KEY`       | No       | none                          | HTTP      | PostHog project key. Unset = no analytics are sent.            |
| `POSTHOG_HOST`      | No       | `https://eu.i.posthog.com`    | HTTP      | PostHog ingestion host.                                        |

**Supported chains:** Base (8453), Unichain (130), Optimism (10), Robinhood (4663)

## MCP Client Configuration

**Remote (no install needed):**

```json
{
  "mcpServers": {
    "arcadia-finance": {
      "url": "https://mcp.arcadia.finance/mcp"
    }
  }
}
```

**Via npx** (local stdio):

```json
{
  "mcpServers": {
    "arcadia-finance": {
      "command": "npx",
      "args": ["-y", "@arcadia-finance/mcp-server"],
      "env": {
        "RPC_URL_BASE": "https://base-mainnet.g.alchemy.com/v2/your-key"
      }
    }
  }
}
```

**Claude Code:**

```bash
# Remote
claude mcp add arcadia-finance --transport http https://mcp.arcadia.finance/mcp

# Local
claude mcp add arcadia-finance -- npx -y @arcadia-finance/mcp-server
```

**From source** (local development):

```json
{
  "mcpServers": {
    "arcadia-finance": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "RPC_URL_BASE": "https://base-mainnet.g.alchemy.com/v2/your-key"
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

| Skill             | Description                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `clamm-liquidity` | Concentrated liquidity management: concepts, intent-based automation, and step-by-step workflows. |

## Reporting Issues

Found a bug, missing feature, or unclear documentation while using this server?
Open an issue: https://github.com/arcadia-finance/mcp-server/issues

**For AI agents:** If you hit a gap during task execution, open an issue with:

- Tool name and parameters you used
- What you expected vs what happened
- The strategy or goal you were trying to execute

Pull requests for documentation fixes are welcome from agents and humans alike. All PRs require human review before merging.

## Where to Find Us

- **npm:** [@arcadia-finance/mcp-server](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
- **MCP Registry:** [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/?q=arcadia)
- **Smithery:** [smithery.ai](https://smithery.ai/servers/arcadia-finance/mcp-server)
- **MCP Servers:** [mcpservers.org](https://mcpservers.org/en/servers/arcadia-finance/mcp-server)
- **LobeHub:** [lobehub.com](https://lobehub.com/mcp/arcadia-finance-mcp-server)
- **PulseMCP:** [pulsemcp.com](https://www.pulsemcp.com/servers/arcadia-finance)
- **MCP Market:** [mcpmarket.com](https://mcpmarket.com/server/arcadia-finance)
- **Glama:** [glama.ai](https://glama.ai/mcp/servers/arcadia-finance/mcp-server)
- **awesome-mcp-servers:** [github.com/TensorBlock/awesome-mcp-servers](https://github.com/TensorBlock/awesome-mcp-servers)

## Development

```bash
yarn dev          # Run with tsx (hot reload)
yarn build        # Compile TypeScript
yarn test         # Run tests
yarn lint         # Lint with ESLint
yarn format       # Check formatting with Prettier
```
