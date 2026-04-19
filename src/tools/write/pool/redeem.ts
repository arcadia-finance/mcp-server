import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CHAIN_ID_DESCRIPTION, type ChainId, type ChainConfig } from "../../../config/chains.js";
import { trancheAbi } from "../../../abis/index.js";
import { appendDataSuffix } from "../../../utils/attribution.js";
import { validateAddress } from "../../../utils/validation.js";
import { SimpleTransactionOutput } from "../../output-schemas.js";

export function registerPoolRedeemTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "write.pool.redeem",
    {
      annotations: {
        title: "Build Pool Redeem Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      outputSchema: SimpleTransactionOutput,
      description:
        "Build an unsigned redeem transaction to withdraw from an Arcadia lending tranche (ERC-4626). Burns tranche shares and returns the corresponding amount of underlying asset, including accrued interest. The owner must be the shares holder; receiver is where the underlying asset is sent.",
      inputSchema: {
        tranche_address: z
          .string()
          .describe(
            "Tranche contract address (ERC-4626 vault). Get this from read.pool.list — each pool's `tranches[0].address`.",
          ),
        shares: z
          .string()
          .describe(
            "Amount of tranche shares to burn, in raw units. To redeem everything, use the owner's full share balance.",
          ),
        receiver: z
          .string()
          .describe("Address that receives the underlying asset. Usually the owner's own wallet."),
        owner: z
          .string()
          .describe(
            "Address that owns the tranche shares being burned. Normally the signer's own wallet.",
          ),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      },
    },
    async (params) => {
      try {
        const validTranche = validateAddress(params.tranche_address, "tranche_address");
        const validReceiver = validateAddress(params.receiver, "receiver");
        const validOwner = validateAddress(params.owner, "owner");
        const shares = BigInt(params.shares);

        let data = encodeFunctionData({
          abi: trancheAbi,
          functionName: "redeem",
          args: [shares, validReceiver, validOwner],
        });
        data = appendDataSuffix(data) as `0x${string}`;

        const result = {
          description: `Redeem ${params.shares} shares of tranche ${params.tranche_address}, sending the underlying asset to ${params.receiver}`,
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
