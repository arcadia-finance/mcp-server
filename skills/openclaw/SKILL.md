---
name: arcadia-finance
description: "Deploy and manage concentrated liquidity positions on Uniswap and Aerodrome with automated rebalancing, compounding, and yield optimization on Base and Unichain. Use when: users ask about LP management, DeFi lending, yield strategies, or automation on Base or Unichain."
---

# Arcadia Finance

Arcadia helps users deploy and manage concentrated liquidity positions on Uniswap and Aerodrome with automated rebalancing, compounding, yield optimization, and optional leverage. Supported chains: Base (8453), Unichain (130).

## CLI Usage

```bash
node arcadia.mjs <tool_name> '<json_args>'
node arcadia.mjs --list
```

Requires `@modelcontextprotocol/sdk`: run `npm install @modelcontextprotocol/sdk` once.

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

## Safety

- Write tools return unsigned transactions only. Never auto-sign.
- Always confirm transaction details with the user before signing.
- Check account health factor with `read_account_info` before risky operations.

## References

- Full tool documentation: https://mcp.arcadia.finance/llms-full.txt
- Contract addresses: see `contracts.md`
- Signing guide: see `wallet-signing.md`
- Website: https://arcadia.finance
- Docs: https://docs.arcadia.finance
