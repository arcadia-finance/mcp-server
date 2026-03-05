import { z } from "zod";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, optimism } from "viem/chains";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";

const VIEM_CHAINS: Record<number, typeof base | typeof optimism> = {
  8453: base,
  10: optimism,
};

export function registerSignAndSendTool(server: McpServer, chains: Record<ChainId, ChainConfig>) {
  server.tool(
    "sign_and_send_tx",
    "DEV ONLY — Sign and broadcast an unsigned transaction using a local private key (PK env var). For production, use a dedicated wallet MCP server (Fireblocks, Safe, Turnkey, etc.) instead of this tool. Takes the transaction object returned by any build_*_tx tool and submits it onchain.",
    {
      to: z.string().describe("Target contract address"),
      data: z.string().describe("Encoded calldata (hex)"),
      value: z.string().default("0").describe("Value in wei (default '0')"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async (params) => {
      try {
        const pk = process.env.PK;
        if (!pk) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: PK env var not set. Set PK to a private key (hex) to enable transaction signing. This tool is for development only — use a dedicated wallet MCP server for production.",
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

        const hash = await wallet.sendTransaction({
          to: params.to as `0x${string}`,
          data: params.data as `0x${string}`,
          value: BigInt(params.value),
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
