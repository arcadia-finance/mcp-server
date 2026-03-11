# Arcadia Finance MCP Server

MCP server exposing Arcadia's DeFi protocol (concentrated liquidity, leverage, automated rebalancing) as tools for AI agents. Published as `@arcadia-finance/mcp-server` on npm. Supported chains: Base (8453), Unichain (130).

## Development

```bash
yarn install
yarn build      # tsc + copy ABIs to dist/
yarn dev        # tsx with hot reload
yarn test       # vitest run
yarn lint       # eslint src/
yarn format     # prettier
```

Node >= 22, yarn 4.13.0. All env vars are optional — RPC URLs fall back to public RPCs, `PK` enables dev-only signing.

## Architecture

Entry point: `src/index.ts`. Two transport modes controlled by `TRANSPORT` env var:
- **stdio** (default) — for local MCP clients (Claude Desktop, Cursor, Claude Code)
- **http** — Streamable HTTP on Express, session-based with 30-min TTL. Deployed at `https://mcp.arcadia.finance/mcp`. Routes: `POST /mcp`, `GET /mcp`, `DELETE /mcp`, `GET /health`. Configurable via env vars: `PORT` (default 3000), `ALLOWED_ORIGINS` (CORS/DNS rebinding, default `https://mcp.arcadia.finance`), `RATE_LIMIT_RPM` (per-session rate limit, default 60). See README for full env var table.

Tools in `src/tools/`, organized by category and entity:

- **read/** — Query tools. One file per entity group:
  - `account.ts` (3 tools: `read.account.info`, `read.account.history`, `read.account.pnl`)
  - `wallet.ts` (4 tools: `read.wallet.balances`, `read.wallet.allowances`, `read.wallet.accounts`, `read.wallet.points`)
  - `strategy.ts` (3 tools: `read.strategy.list`, `read.strategy.info`, `read.strategy.recommendation`)
  - `asset-managers.ts` (1 tool: `read.asset_manager.intents`)
  - `assets.ts` (2 tools: `read.asset.list`, `read.asset.prices`)
  - `pools.ts` (2 tools: `read.pool.list`, `read.pool.info`)
  - `points.ts` (1 tool: `read.point_leaderboard`)
  - `guides.ts` (1 tool: `read.guides`)
- **write/account/** — Account transaction builders (11 tools). Simple tools encode via viem; batched tools (add-liquidity, close, swap, deleverage, remove-liquidity, stake) proxy through backend API. `format-response.ts` and `metadata.ts` are shared helpers.
- **write/wallet/** — Wallet transaction builders. `approve.ts` (1 tool)
- **write/asset-managers/** — Asset manager transaction builders (9 tools). `rebalancer.ts`, `compounder.ts` (2 tools: `write.asset_manager.compounder` + `write.asset_manager.compounder_staked`), `yield-claimer.ts` (2 tools: `write.asset_manager.yield_claimer` + `write.asset_manager.yield_claimer_cowswap`), `cow-swapper.ts`, `merkl-operator.ts`, `set-asset-managers.ts`. `shared.ts` and `encoding.ts` are helpers.
- **dev/** — Dev-only tools. `send.ts` (1 tool)

Supporting code:
- `src/clients/api.ts` — Centralized API client with `throwApiError` for error handling
- `src/clients/chain.ts` — viem public clients per chain
- `src/config/addresses.ts` — Contract addresses per chain
- `src/config/chains.ts` — Chain resolution and config
- `src/abis/` — Contract ABIs (JSON, copied to dist/ at build time)
- `src/utils/attribution.ts` — ERC-8021 builder code suffix (`bc_u3g3444p`), appended to all transaction calldata via `appendDataSuffix()`
- `src/resources/` — MCP resources (guides)
- `src/prompts/` — MCP prompt workflows
- `skills/` — Claude Code skills for guided workflows (shipped in npm package)

## Conventions

- All `write.*` tools return **unsigned** transaction objects — signing is the client's responsibility
- Tool names use dot-notation hierarchy: `{namespace}.{singular-entity}.{action}`. Total: 38 tools (17 read, 20 write, 1 dev).
- Batched write tool responses go through `formatBatchedResponse()` which appends the ERC-8021 suffix to calldata
- Tests: unit tests use mock fetch, integration tests (`*.integration.test.ts`) hit live APIs — exclude from CI
- `dev.send` is always registered but checks `PK` env var at runtime — returns error if not set
