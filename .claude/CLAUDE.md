# Arcadia Finance MCP Server

MCP server exposing Arcadia's DeFi protocol (concentrated liquidity, leverage, automated rebalancing) as tools for AI agents. Published as `@arcadia-finance/mcp-server` on npm. Supported chains: Base (8453), Optimism (10), Unichain (130).

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
- **http** — Streamable HTTP on Express, session-based with 30-min TTL. Deployed at `https://mcp.arcadia.finance/mcp`. Routes: `POST /mcp`, `GET /mcp`, `DELETE /mcp`, `GET /health`.

Tools in `src/tools/`:

- **read/** (8 files, 11 tools) — Query account state, pools, strategies, assets, balances, guides. Pure API reads.
- **write/** (9 files, 9 tools) — Encode unsigned transactions via viem. Return `{to, data, value, chainId}`.
- **advanced/** (6 tool files + helpers) — Complex position management proxied through backend API. `format-response.ts` and `account-metadata.ts` are shared helpers, not tools.

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

- All `write.*` and `advanced.*` tools return **unsigned** transaction objects — signing is the client's responsibility
- Tool names use dot-notation hierarchy: `read.*`, `write.*`, `advanced.*`, `dev.*`
- Advanced tool responses go through `formatAdvancedResponse()` which appends the ERC-8021 suffix to calldata
- Tests: unit tests use mock fetch, integration tests (`*.integration.test.ts`) hit live APIs — exclude from CI
- `dev.sign_and_send` is always registered but checks `PK` env var at runtime — returns error if not set
