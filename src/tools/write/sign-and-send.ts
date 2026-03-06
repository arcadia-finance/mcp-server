import { z } from "zod";
import { createWalletClient, createPublicClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism, unichain } from "viem/chains";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";

const VIEM_CHAINS: Record<number, Chain> = {
  8453: base,
  10: optimism,
  130: unichain,
};

export function registerSignAndSendTool(server: McpServer, chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "dev.sign_and_send",
    {
      annotations: {
        title: "Sign and Send Transaction",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      description:
        "DEV ONLY — Sign and broadcast an unsigned transaction using a local private key (PK env var). For production, use a dedicated wallet MCP server (Fireblocks, Safe, Turnkey, etc.) instead of this tool. Takes the transaction object returned by any write.* or advanced.* tool and submits it onchain.",
      inputSchema: {
        to: z.string().describe("Target contract address"),
        data: z.string().describe("Encoded calldata (hex)"),
        value: z.string().default("0").describe("Value in wei (default '0')"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const pk = process.env.PK;
        if (!pk) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: PK not set. Either create a .env file with PK=0x... in the server directory, or set PK in your MCP client config env block. This tool is for development only — use a dedicated wallet MCP server for production.",
              },
            ],
            isError: true,
          };
        }

        const chain = VIEM_CHAINS[params.chain_id];
        const chainConfig = chains[params.chain_id as ChainId];
        if (!chainConfig) {
          return {
            content: [
              { type: "text" as const, text: `Error: Unsupported chain ID ${params.chain_id}` },
            ],
            isError: true,
          };
        }

        const transport = http(chainConfig.rpcUrl);
        const account = privateKeyToAccount(pk as `0x${string}`);
        const wallet = createWalletClient({ account, chain, transport });
        const client = createPublicClient({ chain, transport });

        const gasEstimate = await client.estimateGas({
          account: account.address,
          to: params.to as `0x${string}`,
          data: params.data as `0x${string}`,
          value: BigInt(params.value),
        });
        const gasLimit = (gasEstimate * 120n) / 100n;

        const hash = await wallet.sendTransaction({
          to: params.to as `0x${string}`,
          data: params.data as `0x${string}`,
          value: BigInt(params.value),
          gas: gasLimit,
          chain,
        });

        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  signer: account.address,
                  txHash: receipt.transactionHash,
                  status: receipt.status,
                  blockNumber: Number(receipt.blockNumber),
                  gasLimit: Number(gasLimit),
                  gasUsed: Number(receipt.gasUsed),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
