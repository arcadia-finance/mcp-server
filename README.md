# Arcadia Finance MCP Server

[![npm](https://img.shields.io/npm/v/@arcadia-finance/mcp-server)](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@arcadia-finance/mcp-server)](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-2026--07--28-green)](https://modelcontextprotocol.io/)
[![MCP Badge](https://lobehub.com/badge/mcp/arcadia-finance-mcp-server)](https://lobehub.com/mcp/arcadia-finance-mcp-server)
[![arcadia-finance-mcp-server MCP server](https://glama.ai/mcp/servers/arcadia-finance/mcp-server/badges/score.svg)](https://glama.ai/mcp/servers/arcadia-finance/mcp-server)
[![mcptry](https://mcptry.com/badge/io.github.arcadia-finance/mcp-server)](https://mcptry.com/servers/io.github.arcadia-finance/mcp-server)
[![Arcadia Finance MCP on mcprush](https://mcprush.com/badge/arcadia-finance-mcp/score.svg)](https://mcprush.com/to/arcadia-finance-mcp?ref=badge)

MCP server for [Arcadia Finance](https://arcadia.finance), a platform for concentrated liquidity on Uniswap and Aero with automated rebalancing, compounding, yield optimization, and leverage, or single-sided liquidity into lending pools. Read protocol data and build unsigned transactions for LP management, borrowing and deposits. Live on Base, Optimism, Unichain and Robinhood.

## Quick start

The hosted server needs no install and no API key:

```
https://mcp.arcadia.finance/mcp
```

[![Add to Claude](https://img.shields.io/badge/Claude-Add_Connector-D97757?logo=claude&logoColor=white)](https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=Arcadia%20Finance&connectorUrl=https%3A%2F%2Fmcp.arcadia.finance%2Fmcp)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0078d4?logo=visualstudiocode)](https://insiders.vscode.dev/redirect/mcp/install?name=arcadia-finance&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.arcadia.finance%2Fmcp%22%7D)
[![Install in Cursor](https://img.shields.io/badge/Cursor-Install_Server-black?logo=cursor)](https://cursor.com/en/install-mcp?name=arcadia-finance&config=eyJ1cmwiOiJodHRwczovL21jcC5hcmNhZGlhLmZpbmFuY2UvbWNwIn0%3D)

The Claude button opens **Customize > Connectors > Add custom connector** with the name and URL filled in. Claude Free allows one custom connector. On Team and Enterprise, an owner adds it under **Organization settings > Connectors**.

Most clients accept this config. Cursor reads it from `.cursor/mcp.json` or `~/.cursor/mcp.json`. VS Code uses `.vscode/mcp.json` with `"servers"` in place of `"mcpServers"` and `"type": "http"` on the server.

```json
{
  "mcpServers": {
    "arcadia-finance": {
      "url": "https://mcp.arcadia.finance/mcp"
    }
  }
}
```

<details>
<summary>Claude Code</summary>

Install the plugin, which adds the server and the `clamm-liquidity` skill:

```
/plugin install arcadia --marketplace arcadia-finance/mcp-server
```

On Claude Code older than 2.1.275, run `/plugin marketplace add arcadia-finance/mcp-server`, then `/plugin install arcadia@arcadia-finance`. To add only the server:

```bash
claude mcp add --transport http arcadia-finance https://mcp.arcadia.finance/mcp
```

</details>

<details>
<summary>ChatGPT</summary>

Add `https://mcp.arcadia.finance/mcp` as a custom MCP app. Availability depends on your plan and workspace settings, see [OpenAI's guide](https://help.openai.com/en/articles/12584461).

</details>

<details>
<summary>Codex CLI</summary>

```bash
codex mcp add arcadia-finance --url https://mcp.arcadia.finance/mcp
```

</details>

<details>
<summary>Gemini CLI</summary>

```bash
gemini mcp add --transport http arcadia-finance https://mcp.arcadia.finance/mcp
```

</details>

### Run it locally

To run the server as a local process instead (Node.js 22 or newer):

```json
{
  "mcpServers": {
    "arcadia-finance": {
      "command": "npx",
      "args": ["-y", "@arcadia-finance/mcp-server"]
    }
  }
}
```

In Claude Code: `claude mcp add arcadia-finance -- npx -y @arcadia-finance/mcp-server`. Optional environment variables are listed under [Configuration](#configuration).

### Try it

- "Which Arcadia strategies on Base have the highest APY right now?"
- "Show the health factor and positions of Arcadia account 0x..."
- "Open the top WETH/USDC strategy with 1,000 USDC and turn on compounding."
- "What do the Arcadia lending pools pay lenders?"

Write tools return unsigned transactions. Your wallet signs them, see [Transaction Signing](#transaction-signing).

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

Registered only when the `PK` env var is set.

| Tool       | Description                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev_send` | Sign and broadcast an unsigned transaction using a local private key (`PK` env var). Not for production: use a dedicated wallet MCP server instead. |

## Transaction Signing

All write tools return **unsigned transactions** as `{ to, data, value, chainId }`. This server does not sign or broadcast them; your agent or application does.

### Options

**Wallet MCP servers** (recommended for production):

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
# .env in the server directory (gitignored, never commit it)
PK=0xYourPrivateKeyHex
RPC_URL_BASE=https://base-mainnet.g.alchemy.com/v2/your-key
```

The server loads `.env` on startup. Values in the MCP client `env` block take precedence.

## Configuration

All environment variables are optional.

| Variable            | Required | Default                       | Transport | Description                                                    |
| ------------------- | -------- | ----------------------------- | --------- | -------------------------------------------------------------- |
| `RPC_URL_BASE`      | No       | Public RPC                    | Both      | RPC URL for Base (8453).                                       |
| `RPC_URL_UNICHAIN`  | No       | Public RPC                    | Both      | RPC URL for Unichain (130).                                    |
| `RPC_URL_OPTIMISM`  | No       | Public RPC                    | Both      | RPC URL for Optimism (10).                                     |
| `RPC_URL_ROBINHOOD` | No       | Public RPC                    | Both      | RPC URL for Robinhood (4663).                                  |
| `PK`                | No       | none                          | Both      | Private key (hex) for dev-only `dev_send` tool.                |
| `TRANSPORT`         | No       | `stdio`                       | n/a       | Transport mode: `stdio` or `http`.                             |
| `PORT`              | No       | `3000`                        | HTTP      | Listen port for HTTP transport.                                |
| `ALLOWED_ORIGINS`   | No       | `https://mcp.arcadia.finance` | HTTP      | Comma-separated allowed Origin headers (CORS / DNS rebinding). |
| `RATE_LIMIT_RPM`    | No       | `600`                         | HTTP      | Max requests per minute per client IP.                         |
| `POSTHOG_KEY`       | No       | none                          | HTTP      | PostHog project key. Unset = no analytics are sent.            |
| `POSTHOG_HOST`      | No       | `https://eu.i.posthog.com`    | HTTP      | PostHog ingestion host.                                        |

## Skills

The `skills/` directory contains skills that teach AI agents how to use this MCP server. The Claude Code plugin (see [Quick start](#quick-start)) installs them together with the server. To install a skill on its own, symlink it into your skills directory:

```bash
ln -s /path/to/mcp-server/skills/clamm-liquidity ~/.claude/skills/clamm-liquidity
```

| Skill             | Description                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `clamm-liquidity` | Concentrated liquidity management: concepts, intent-based automation, and step-by-step workflows. |

The [OpenClaw](https://clawhub.ai/skills/arcadia-finance) skill in `openclaw/` calls the hosted server through a curl script, for agents without MCP support.

## Reporting Issues

Open an issue for bugs, missing features or unclear documentation: https://github.com/arcadia-finance/mcp-server/issues

**For AI agents:** If you hit a gap during task execution, open an issue with:

- Tool name and parameters you used
- What you expected vs what happened
- The strategy or goal you were trying to execute

Pull requests for documentation fixes are welcome. Every PR needs a human review before merging.

## Where to Find Us

- **npm:** [@arcadia-finance/mcp-server](https://www.npmjs.com/package/@arcadia-finance/mcp-server)
- **MCP Registry:** [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/?q=arcadia)
- **MCP Servers:** [mcpservers.org](https://mcpservers.org/en/servers/arcadia-finance/mcp-server)
- **LobeHub:** [lobehub.com](https://lobehub.com/mcp/arcadia-finance-mcp-server)
- **PulseMCP:** [pulsemcp.com](https://www.pulsemcp.com/servers/arcadia-finance)
- **MCP Market:** [mcpmarket.com](https://mcpmarket.com/server/arcadia-finance)
- **Glama:** [glama.ai](https://glama.ai/mcp/servers/arcadia-finance/mcp-server)
- **mcp.so:** [mcp.so](https://mcp.so/server/arcadia-finance/mcp-server)
- **awesome-mcp-servers:** [github.com/punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers)

## Development

```bash
yarn install
yarn build        # Compile TypeScript
yarn dev          # Run with tsx (hot reload)
yarn test         # Run tests
yarn lint         # Lint with ESLint
yarn format       # Check formatting with Prettier
```

To point a client at your build, use `"command": "node"` with `"args": ["/absolute/path/to/mcp-server/dist/index.js"]`.

## Privacy

When `POSTHOG_KEY` is set on an HTTP deployment, the server records one analytics event per tool call in PostHog (EU ingestion host by default): the tool name, its arguments (which can include public wallet and account addresses), whether the call failed, the duration, and the client name and version. Events carry no person profile. Running the server locally over stdio sends no analytics, and neither does an HTTP deployment without `POSTHOG_KEY`. Tool calls never carry private keys. The development-only `dev_send` tool signs with a `PK` set in the server's own environment; the hosted server has none. Questions: legal@arcadia.finance.

## License

Copyright (C) 2026 Pragma Labs. Licensed under the [GNU Affero General Public License v3.0](LICENSE.md).
