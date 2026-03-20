---
name: arcadia-finance
description: "DeFi liquidity management on Uniswap and Aerodrome, live on Base and Unichain. Deploy LP positions with automated rebalancing, compounding, yield optimization, and leverage via Arcadia Finance."
metadata:
  openclaw:
    homepage: https://arcadia.finance
    install:
      - kind: node
        package: "@modelcontextprotocol/sdk"
        bins: []
---

# Arcadia Finance

Arcadia helps users deploy and manage concentrated liquidity positions on Uniswap and Aerodrome with automated rebalancing, compounding, yield optimization, and optional leverage. Supported chains: Base (8453), Unichain (130).

## CLI Usage

```bash
node arcadia.mjs <tool_name> '<json_args>'
node arcadia.mjs --list
```

The `@modelcontextprotocol/sdk` dependency is installed automatically via the skill's install spec.

## Read Operations

```bash
# List all accounts for a wallet
node arcadia.mjs read_wallet_accounts '{"wallet_address":"0x..."}'

# Account details (health factor, collateral, debt, positions)
node arcadia.mjs read_account_info '{"account_address":"0x..."}'

# Featured LP strategies with APY
node arcadia.mjs read_strategy_list '{"featured_only":true}'

# Lending pools (TVL, APY, utilization)
node arcadia.mjs read_pool_list '{}'

# Workflow guides (automation setup, strategy selection)
node arcadia.mjs read_guides '{"topic":"overview"}'

# Available automations (rebalancer, compounder, yield claimer)
node arcadia.mjs read_asset_manager_intents '{}'
```

## Write Operations

All write tools return unsigned transactions `{ to, data, value, chainId }`. See `wallet-signing.md` for how to sign and broadcast.

```bash
# Open LP position (deposits + swaps + mints LP atomically)
node arcadia.mjs write_account_add_liquidity '{"account_address":"0x...","wallet_address":"0x...","positions":[{"strategy_id":123}],"deposits":[{"asset":"0x...","amount":"1000000","decimals":6}]}'

# Close position (burn LP + swap + repay in one tx)
node arcadia.mjs write_account_close '{"account_address":"0x...","assets":[...],"receive_assets":[...]}'

# Enable automation
node arcadia.mjs write_asset_manager_rebalancer '{"dex_protocol":"slipstream"}'
node arcadia.mjs write_account_set_asset_managers '{"account_address":"0x...","asset_managers":[...],"statuses":[...],"datas":[...]}'
```

## Configuration

The CLI connects to `https://mcp.arcadia.finance/mcp` by default. Set `ARCADIA_MCP_URL` to override (e.g. for local development).

## Safety

- Write tools return unsigned transactions only. Never auto-sign.
- Always confirm transaction details with the user before signing.
- Check account health factor with `read_account_info` before risky operations.
- Do not pass private keys or secrets as tool arguments. Only public addresses and amounts are needed.

## References

- Full tool documentation: https://mcp.arcadia.finance/llms-full.txt
- Contract addresses: see `contracts.md`
- Signing guide: see `wallet-signing.md`
- Website: https://arcadia.finance
- Docs: https://docs.arcadia.finance
