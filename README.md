# Arcadia Finance MCP Server

[![npm](https://img.shields.io/npm/v/@arcadia-finance/mcp-server)](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@arcadia-finance/mcp-server)](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2025--11--25-green)](https://modelcontextprotocol.io/)
[![smithery badge](https://smithery.ai/badge/@arcadia-finance/mcp-server)](https://smithery.ai/servers/arcadia-finance/mcp-server)
[![MCP Badge](https://lobehub.com/badge/mcp/arcadia-finance-mcp-server)](https://lobehub.com/mcp/arcadia-finance-mcp-server)
[![arcadia-finance-mcp-server MCP server](https://glama.ai/mcp/servers/arcadia-finance/arcadia-finance-mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/arcadia-finance/arcadia-finance-mcp-server)

MCP server for [Arcadia Finance](https://arcadia.finance), a platform to manage Uniswap and Aerodrome concentrated liquidity positions with built-in leverage, automated rebalancing, and yield optimization. Read protocol data and build unsigned transactions for LP management, borrowing, deposits, and more.

Designed for AI agents (Claude, Cursor, etc.) to interact with Arcadia onchain.

## Install

[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0078d4?logo=visualstudiocode)](https://vscode.dev/redirect/mcp/install?name=arcadia-finance&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40arcadia-finance%2Fmcp-server%22%5D%7D)
[![Install in Cursor](https://img.shields.io/badge/Cursor-Install_Server-black?logo=cursor)](https://cursor.com/en/install-mcp?name=arcadia-finance&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBhcmNhZGlhLWZpbmFuY2UvbWNwLXNlcnZlciJdfQ==)

## Tools

### Read Tools

| Tool                           | Description                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `read.account.info`            | Account overview: health factor, collateral, debt, positions, liquidation price, automation status.         |
| `read.account.history`         | Historical account value over time.                                                                         |
| `read.account.pnl`             | PnL and yield data for an account.                                                                          |
| `read.wallet.accounts`         | List all Arcadia accounts owned by a wallet address.                                                        |
| `read.wallet.balances`         | On-chain ERC20 balances and native ETH for a wallet address.                                                |
| `read.wallet.allowances`       | Check ERC20 token allowances for a spender. Use before `write.wallet.approve` to avoid redundant approvals. |
| `read.wallet.points`           | Points balance for a specific wallet address.                                                               |
| `read.asset.list`              | Supported collateral assets with addresses, types, decimals.                                                |
| `read.asset.prices`            | USD prices for one or more asset addresses.                                                                 |
| `read.pool.list`               | All lending pools: TVL, APY, utilization, liquidity.                                                        |
| `read.pool.info`               | Single pool detail with APY history over time.                                                              |
| `read.point_leaderboard`       | Paginated Arcadia points leaderboard.                                                                       |
| `read.strategy.list`           | LP strategies with APY, underlyings, pool info. Supports featured filter and pagination.                    |
| `read.strategy.info`           | Full detail for a specific LP strategy: APY per range width, pool config.                                   |
| `read.strategy.recommendation` | Rebalancing recommendation for an account.                                                                  |
| `read.guides`                  | Reference guides: automation setup, strategy selection, strategy templates.                                 |
| `read.asset_manager.intents`   | Available automation intents with tool names, required params, and supported chains.                        |

### Write Tools

All write tools return unsigned transactions as `{ to, data, value, chainId }`.

| Tool                                        | Description                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `write.wallet.approve`                      | Approve an ERC20 token for spending. Required before depositing into an account. Call `read.wallet.allowances` first to check if already approved. |
| `write.account.create`                      | Create a new Arcadia account via Factory.                                                                                                          |
| `write.account.deposit`                     | Deposit ERC20 tokens into an account.                                                                                                              |
| `write.account.withdraw`                    | Withdraw assets from an account.                                                                                                                   |
| `write.account.borrow`                      | Borrow from a lending pool.                                                                                                                        |
| `write.account.repay`                       | Repay debt to a lending pool from wallet.                                                                                                          |
| `write.account.add_liquidity`               | Flash-action: deposit + swap + mint LP + optional leverage, atomically.                                                                            |
| `write.account.remove_liquidity`            | Remove/decrease LP position liquidity.                                                                                                             |
| `write.account.swap`                        | Swap assets within an account (backend-routed).                                                                                                    |
| `write.account.deleverage`                  | Repay debt by selling collateral (swap + repay in one tx).                                                                                         |
| `write.account.close`                       | Atomic close: burn LP + swap + repay debt in one tx.                                                                                               |
| `write.account.stake`                       | Stake, unstake, or claim rewards for LP positions.                                                                                                 |
| `write.asset_manager.rebalancer`            | Encode rebalancer automation args (strategy config, triggers, compound mode).                                                                      |
| `write.asset_manager.compounder`            | Encode standalone compounder args.                                                                                                                 |
| `write.asset_manager.compounder_staked`     | Encode compounder + CowSwap coupled args (sell rewards, buy target token).                                                                         |
| `write.asset_manager.yield_claimer`         | Encode yield claimer args (claim fees to recipient).                                                                                               |
| `write.asset_manager.yield_claimer_cowswap` | Encode yield claimer + CowSwap coupled args.                                                                                                       |
| `write.asset_manager.cow_swapper`           | Encode direct CowSwap mode args (Base only).                                                                                                       |
| `write.asset_manager.merkl_operator`        | Encode Merkl operator args (claim external rewards).                                                                                               |
| `write.account.set_asset_managers`          | Build unsigned setAssetManagers tx from encoded intent args. Combine multiple intents by merging arrays.                                           |

### Dev Tools

Always registered but requires `PK` env var to function.

| Tool       | Description                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev.send` | Sign and broadcast an unsigned transaction using a local private key (`PK` env var). Not for production — use a dedicated wallet MCP server instead. |

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

// tx = result from any write.* tool
const hash = await client.sendTransaction(tx);
```

**Built-in `dev.send` tool (development only):**
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

| Variable           | Required | Default                       | Transport | Description                                                    |
| ------------------ | -------- | ----------------------------- | --------- | -------------------------------------------------------------- |
| `RPC_URL_BASE`     | No       | Public RPC                    | Both      | RPC URL for Base (8453).                                       |
| `RPC_URL_UNICHAIN` | No       | Public RPC                    | Both      | RPC URL for Unichain (130).                                    |
| `PK`               | No       | —                             | Both      | Private key (hex) for dev-only `dev.send` tool.                |
| `TRANSPORT`        | No       | `stdio`                       | —         | Transport mode: `stdio` or `http`.                             |
| `PORT`             | No       | `3000`                        | HTTP      | Listen port for HTTP transport.                                |
| `ALLOWED_ORIGINS`  | No       | `https://mcp.arcadia.finance` | HTTP      | Comma-separated allowed Origin headers (CORS / DNS rebinding). |
| `RATE_LIMIT_RPM`   | No       | `60`                          | HTTP      | Max requests per minute per session.                           |

**Supported chains:** Base (8453), Unichain (130)

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

## Where to Find Us

- **npm:** [@arcadia-finance/mcp-server](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
- **MCP Registry:** [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/?q=arcadia)
- **Smithery:** [smithery.ai](https://smithery.ai/servers/arcadia-finance/mcp-server)
- **MCP Servers:** [mcpservers.org](https://mcpservers.org/en/servers/arcadia-finance/mcp-server)
- **LobeHub:** [lobehub.com](https://lobehub.com/mcp/arcadia-finance-mcp-server)
- **PulseMCP:** [pulsemcp.com](https://www.pulsemcp.com/servers/arcadia-finance)
- **MCP Market:** [mcpmarket.com](https://mcpmarket.com/server/arcadia-finance)
- **Glama:** [glama.ai](https://glama.ai/mcp/servers/arcadia-finance/arcadia-finance-mcp-server)
- **awesome-mcp-servers:** [github.com/TensorBlock/awesome-mcp-servers](https://github.com/TensorBlock/awesome-mcp-servers)

## Development

```bash
yarn dev          # Run with tsx (hot reload)
yarn build        # Compile TypeScript
yarn test         # Run tests
yarn lint         # Lint with ESLint
yarn format       # Check formatting with Prettier
```
