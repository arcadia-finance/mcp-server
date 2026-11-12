import { z } from "zod";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { McpServer } from "@modelcontextprotocol/server";
import { viemChains } from "../../clients/chain.js";
import { CHAIN_ID_DESCRIPTION, type ChainId, type ChainConfig } from "../../config/chains.js";
import { DevSendOutput } from "../output-schemas.js";
import {
  validateAddress,
  validateHexCalldata,
  parseWeiDecimalString,
} from "../../utils/validation.js";

export function registerSendTool(server: McpServer, chains: Record<ChainId, ChainConfig>) {
  const pk = process.env.PK;
  if (!pk) return;

  server.registerTool(
    "dev_send",
    {
      annotations: {
        title: "Sign and Send Transaction",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      description:
        "DEV ONLY: Sign and broadcast an unsigned transaction using a local private key (PK env var). For production, use a dedicated wallet MCP server (Fireblocks, Safe, Turnkey, etc.) instead of this tool. Takes the transaction object returned by any write_* tool and submits it onchain.",
      outputSchema: DevSendOutput,
      inputSchema: z.object({
        to: z.string().describe("Target contract address"),
        data: z.string().describe("Encoded calldata (hex)"),
        value: z.string().default("0").describe("Value in wei (default '0')"),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      }),
    },
    async (params) => {
      try {
        const validTo = validateAddress(params.to, "to");
        const calldata = validateHexCalldata(params.data, "data");
        const valueWei = parseWeiDecimalString(params.value, "value");

        const chain = viemChains[params.chain_id as ChainId];
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
          to: validTo,
          data: calldata,
          value: valueWei,
        });
        const gasLimit = (gasEstimate * 120n) / 100n;

        const hash = await wallet.sendTransaction({
          to: validTo,
          data: calldata,
          value: valueWei,
          gas: gasLimit,
          chain,
        });

        const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });

        const result = {
          signer: account.address,
          txHash: receipt.transactionHash,
          status: receipt.status,
          blockNumber: Number(receipt.blockNumber),
          gasLimit: Number(gasLimit),
          gasUsed: Number(receipt.gasUsed),
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
          structuredContent: result,
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
