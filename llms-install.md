# Installing the Arcadia Finance MCP server

Arcadia Finance MCP server for concentrated liquidity management (Uniswap, Aerodrome, Velodrome) with leverage, automated rebalancing and lending pools on Base, Optimism, Unichain and Robinhood. It needs no API key and no configuration.

## Option 1: remote server (no install)

Add this to the MCP settings file:

```json
{
  "mcpServers": {
    "arcadia-finance": {
      "type": "streamableHttp",
      "url": "https://mcp.arcadia.finance/mcp"
    }
  }
}
```

## Option 2: local server through npx

Requires Node.js 22 or newer.

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

## Optional environment variables

Every variable is optional. RPC URLs fall back to public endpoints.

- `RPC_URL_BASE`, `RPC_URL_OPTIMISM`, `RPC_URL_UNICHAIN`, `RPC_URL_ROBINHOOD`: private RPC endpoints per chain.
- `PK`: private key for the development-only `dev_send` tool. Do not set it for production use.

## Verify the install

Call `read_pool_list`. It returns the Arcadia lending pools with TVL and APY and needs no arguments.

## Notes

- Every `write_*` tool returns an unsigned transaction. Signing and broadcasting are left to the user's wallet.
- Call `read_guides` with topic `overview` for the tool catalog and workflow guides.
