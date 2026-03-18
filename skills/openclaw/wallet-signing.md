# Signing Unsigned Transactions

All Arcadia write tools return unsigned transactions as `{ to, data, value, chainId }`. You need a separate wallet to sign and broadcast.

## Options

**Foundry cast (dev/testing):**

```bash
cast send <to> --data <data> --value <value> --rpc-url $RPC_URL --private-key $PK
```

**Wallet MCP servers (production):**

- MCP Wallet Signer (github.com/nikicat/mcp-wallet-signer): routes to browser wallet (MetaMask, Rabby), non-custodial
- Phantom MCP (@phantom/mcp-server): for Phantom wallet users
- Privy MCP (github.com/incentivai-io/privy-mcp-server): wallet infrastructure
- Coinbase AgentKit (github.com/coinbase/agentkit): wallet-agnostic signing
- Safe MCP (github.com/safer-sh/safer): multi-sig via Safe

**viem/ethers (in code):**

```javascript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const account = privateKeyToAccount("0x...");
const client = createWalletClient({ account, chain: base, transport: http() });
const hash = await client.sendTransaction(tx);
```
