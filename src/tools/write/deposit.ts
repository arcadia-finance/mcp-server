import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { accountAbi, getAccountAbi } from "../../abis/index.js";
import { getPublicClient } from "../../clients/chain.js";
import { appendDataSuffix } from "../../utils/attribution.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";

export function registerDepositTool(server: McpServer, chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "write.deposit",
    {
      annotations: {
        title: "Build Deposit Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Build an unsigned transaction to deposit assets into an Arcadia account as collateral. Supports ERC20 tokens and ERC721 NFTs (LP positions). NOT needed before advanced.add_liquidity — that tool deposits from wallet atomically. Ensure the account is approved first (call read.allowance to check, then write.approve if needed). Account version is auto-detected on-chain (override with account_version if needed).",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        asset_addresses: z.array(z.string()).describe("Token contract addresses to deposit"),
        asset_amounts: z.array(z.string()).describe("Amounts in raw units/wei, one per asset"),
        asset_ids: z
          .array(z.number())
          .optional()
          .describe("Token IDs: 0 for ERC20, NFT token ID for ERC721"),
        asset_types: z
          .array(z.number())
          .optional()
          .describe(
            "V4 only. Asset types per asset: 1=ERC20, 2=ERC721, 3=ERC1155. If omitted, inferred from asset_ids (non-zero → ERC721).",
          ),
        account_version: z
          .number()
          .optional()
          .describe("Override account version (3 or 4). Auto-detected on-chain if omitted."),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        if (params.asset_addresses.length !== params.asset_amounts.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: asset_addresses and asset_amounts must have the same length.",
              },
            ],
            isError: true,
          };
        }

        const validChainId = validateChainId(params.chain_id);
        const validAccount = validateAddress(params.account_address, "account_address");

        // Auto-detect account version on-chain, or use override
        let version = params.account_version ?? 0;
        if (!version) {
          const client = getPublicClient(validChainId, chains);
          version = Number(
            await client.readContract({
              address: validAccount,
              abi: accountAbi,
              functionName: "ACCOUNT_VERSION",
            }),
          );
        }

        const ids = (params.asset_ids ?? params.asset_addresses.map(() => 0)).map((n) => BigInt(n));
        const amounts = params.asset_amounts.map((a) => BigInt(a));
        const abi = getAccountAbi(version);

        const args: unknown[] = [params.asset_addresses as `0x${string}`[], ids, amounts];
        if (version >= 4) {
          const assetTypes = params.asset_types
            ? params.asset_types.map((t) => BigInt(t))
            : ids.map((id) => (id > 0n ? 2n : 1n)); // 0 → ERC20 (1), non-zero → ERC721 (2)
          args.push(assetTypes);
        }

        const data = appendDataSuffix(
          encodeFunctionData({
            abi,
            functionName: "deposit",
            args,
          }),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: `Deposit assets into Arcadia account (V${version})`,
                  transaction: {
                    to: validAccount,
                    data,
                    value: "0",
                    chainId: validChainId,
                  },
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
