# Arcadia Finance MCP Server

MCP server exposing Arcadia's DeFi protocol (concentrated liquidity management, automated rebalancing, compounding, yield optimization, leverage) as tools for AI agents. Published as `@arcadia-finance/mcp-server` on npm. Supported chains: Base (8453), Unichain (130), Optimism (10), Robinhood (4663).

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
- **http**: Streamable HTTP on Express, stateless per the MCP 2026-07-28 spec (`createMcpHandler` from `@modelcontextprotocol/server` v2: a fresh server per request, 2025-era clients served without sessions, GET/DELETE answer 405). Deployed at `https://mcp.arcadia.finance/mcp`. Routes: `POST /mcp`, `GET /health`, `GET /llms.txt`, `GET /llms-full.txt`. Configurable via env vars: `PORT` (default 3000), `ALLOWED_ORIGINS` (CORS, default `https://mcp.arcadia.finance`), `RATE_LIMIT_RPM` (per client IP, default 600). See README for full env var table.

Tools in `src/tools/`, organized by category and entity:

- **read/** — Query tools. One file per entity group:
  - `account.ts` (3 tools: `read_account_info`, `read_account_history`, `read_account_pnl`)
  - `wallet.ts` (4 tools: `read_wallet_balances`, `read_wallet_allowances`, `read_wallet_accounts`, `read_wallet_points`)
  - `strategy.ts` (3 tools: `read_strategy_list`, `read_strategy_info`, `read_strategy_recommendation`)
  - `asset-managers.ts` (2 tools: `read_asset_manager_intents`, `read_asset_manager_current`)
  - `aero-upgrade.ts` (1 tool: `read_account_aero_upgrade`, the per-account Aero upgrade check from `/bundles/aero_migration_candidates`)
  - `assets.ts` (2 tools: `read_asset_list`, `read_asset_prices`)
  - `pools.ts` (2 tools: `read_pool_list`, `read_pool_info`)
  - `points.ts` (1 tool: `read_point_leaderboard`)
  - `guides.ts` (1 tool: `read_guides`)
- **write/account/**: Account transaction builders (12 tools). Simple tools encode via viem; batched tools (add-liquidity, close, swap, deleverage, remove-liquidity, stake, aero-upgrade) proxy through backend API. `aero-upgrade.ts` (`write_account_aero_upgrade`) wraps `/bundles/aero_upgrade` and `/bundles/aero_upgrade/batch`: the one-flashAction upgrade of an account (Slipstream positions and old AERO) with its plan; `src/tools/aero.ts` shapes the plan, the status notes, the next steps and the backend errors (422 codes, 404, 409 VELO reasons). `format-response.ts` and `metadata.ts` are shared helpers.
- **write/pool/**: Lending-tranche transaction builders (2 tools: `deposit.ts` and `redeem.ts`). ERC-4626 deposit / redeem for lenders earning yield on USDC / WETH / cbBTC pools.
- **write/wallet/**: Wallet transaction builders (2 tools): `approve.ts` and `upgrade-velo.ts` (`write_wallet_upgrade_velo`, VELO on Optimism to the new AERO on Base through `/bundles/upgrade_velo`)
- **write/asset-managers/**: Intent-based automation tools (2 tools: `write_account_automations` + `write_account_automations_delta`) in `automations.ts`. `intents.ts` holds the zod mirror of the backend intent union; `shared.ts` is a formatting helper.
  - Automation config is **compiled by the backend**, not encoded here. These tools POST intents to `/v1/api/automations/{account}/{preview,save,apply}` and wrap the returned `setAssetManagers` calldata (plus the ERC-8021 suffix) into an unsigned tx. The asset-manager address book, compatibility rules and v3 packed metadata live in `fallback-asset-managers/app/services/automation_config/` and must not be duplicated here.
- **dev/** — Dev-only tools. `send.ts` (1 tool)

Supporting code:
- `src/clients/api.ts` — Centralized API client with `throwApiError` for error handling
- `src/clients/chain.ts` — viem public clients per chain
- `src/config/addresses.ts` — Contract addresses per chain
- `src/config/chains.ts` — Chain resolution and config
- `src/abis/` — Contract ABIs (JSON, copied to dist/ at build time)
- `src/utils/attribution.ts` — ERC-8021 builder code suffix (`bc_u3g3444p`), appended to all transaction calldata via `appendDataSuffix()`
- `src/utils/analytics.ts`: PostHog `mcp_tool_called` event per tool call (name, args, outcome, client). Only active on the HTTP transport with `POSTHOG_KEY` set; stdio never reports
- `src/resources/` — MCP resources (guides)
- `src/prompts/` — MCP prompt workflows
- `skills/` — Claude Code skills for guided workflows (shipped in npm package)

## Conventions

- All `write_*` tools return **unsigned** transaction objects: signing is the client's responsibility
- Tool names are snake_case with a `{namespace}_{singular-entity}_{action}` hierarchy, the same on every transport (model APIs accept only `[a-zA-Z0-9_-]{1,64}`). Total: 38 tools (19 read, 18 write, 1 dev).
- Batched write tool responses go through `formatBatchedResponse()` which appends the ERC-8021 suffix to calldata
- Tests: unit tests use mock fetch, integration tests (`*.integration.test.ts`) hit live APIs — exclude from CI
- `dev_send` is always registered but checks `PK` env var at runtime: returns error if not set
