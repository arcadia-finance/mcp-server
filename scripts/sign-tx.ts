/**
 * Test-only signing script. NOT committed to the repo.
 * Signs + submits unsigned transaction calldata from MCP tool output.
 *
 * Usage: npx tsx scripts/sign-tx.ts '{"to":"0x...","data":"0x...","value":"0","chainId":8453}'
 * Env:   PK           — private key (hex, 0x-prefixed)
 *        RPC_URL_BASE — Base RPC endpoint
 */

import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Load .env manually (no dotenv dependency)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const pk = process.env.PK;
const rpc = process.env.RPC_URL_BASE;
if (!pk) throw new Error("PK not set in .env");
if (!rpc) throw new Error("RPC_URL_BASE not set in .env");

const json = process.argv[2];
if (!json) {
  console.error('Usage: npx tsx scripts/sign-tx.ts \'{"to":"0x...","data":"0x...","value":"0","chainId":8453}\'');
  process.exit(1);
}

const tx = JSON.parse(json) as { to: string; data: string; value: string; chainId: number };

const account = privateKeyToAccount(pk as `0x${string}`);
const transport = http(rpc);

const wallet = createWalletClient({ account, chain: base, transport });
const client = createPublicClient({ chain: base, transport });

console.log(`Signing with ${account.address}`);
console.log(`To: ${tx.to}`);
console.log(`Chain: ${tx.chainId}`);

const hash = await wallet.sendTransaction({
  to: tx.to as `0x${string}`,
  data: tx.data as `0x${string}`,
  value: tx.value === "0" ? 0n : parseEther(tx.value),
});

console.log(`Tx hash: ${hash}`);
console.log("Waiting for receipt...");

const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });

console.log(
  JSON.stringify(
    {
      txHash: receipt.transactionHash,
      status: receipt.status,
      blockNumber: Number(receipt.blockNumber),
      gasUsed: Number(receipt.gasUsed),
    },
    null,
    2,
  ),
);

process.exit(receipt.status === "success" ? 0 : 1);
