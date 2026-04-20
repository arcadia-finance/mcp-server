import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CHAIN_ID_DESCRIPTION, type ChainId, type ChainConfig } from "../../../config/chains.js";
import { trancheAbi } from "../../../abis/index.js";
import { appendDataSuffix } from "../../../utils/attribution.js";
import { validateAddress } from "../../../utils/validation.js";
import { SimpleTransactionOutput } from "../../output-schemas.js";

export function registerPoolDepositTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "write.pool.deposit",
    {
      annotations: {
        title: "Build Pool Deposit Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      outputSchema: SimpleTransactionOutput,
      description:
        "Build an unsigned deposit transaction into an Arcadia lending tranche (ERC-4626). Lenders deposit the pool's underlying asset (USDC/WETH/cbBTC) and receive tranche shares that accrue interest from borrowers. Requires prior ERC-20 approval to the tranche (see write.wallet.approve). To check current lender yield, call read.pool.list or read.pool.info.",
      inputSchema: {
        tranche_address: z
          .string()
          .describe(
            "Tranche contract address (ERC-4626 vault). Get this from read.pool.list — each pool's `tranches[0].address`.",
          ),
        assets: z
          .string()
          .describe(
            "Amount of underlying asset to deposit, in raw units (e.g. '1000000' = 1 USDC since USDC has 6 decimals).",
          ),
        receiver: z
          .string()
          .describe(
            "Address that receives the minted tranche shares. Usually the depositor's own wallet.",
          ),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      },
    },
    async (params) => {
      try {
        const validTranche = validateAddress(params.tranche_address, "tranche_address");
        const validReceiver = validateAddress(params.receiver, "receiver");
        const assets = BigInt(params.assets);

        let data = encodeFunctionData({
          abi: trancheAbi,
          functionName: "deposit",
          args: [assets, validReceiver],
        });
        data = appendDataSuffix(data) as `0x${string}`;

        const result = {
          description: `Deposit ${params.assets} of the tranche's underlying asset into ${params.tranche_address}, minting shares to ${params.receiver}`,
          transaction: {
            to: validTranche,
            data,
            value: "0",
            chainId: params.chain_id,
          },
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
