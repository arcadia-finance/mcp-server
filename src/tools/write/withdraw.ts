import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { accountAbi, getAccountAbi } from "../../abis/index.js";
import { getPublicClient } from "../../clients/chain.js";
import { appendDataSuffix } from "../../utils/attribution.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";

export function registerWithdrawTool(server: McpServer, chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "build_withdraw_tx",
    {
      annotations: {
        title: "Build Withdraw Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Build an unsigned transaction to withdraw assets from an Arcadia account to the owner's wallet. Only the account owner can withdraw. Will revert if the account has debt and withdrawal would make it undercollateralized. Does not support max_uint256 — pass exact amounts from get_account_info. Account version is auto-detected on-chain (override with account_version if needed).",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        asset_addresses: z.array(z.string()).describe("Token contract addresses to withdraw"),
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
        if (params.asset_amounts.some((a) => a === "max_uint256")) {
          return {
            content: [
              {
                type: "text" as const,
                text: 'Error: build_withdraw_tx does not support "max_uint256". Pass exact amounts from get_account_info.',
              },
            ],
            isError: true,
          };
        }
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
            functionName: "withdraw",
            args,
          }),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: `Withdraw assets from Arcadia account (V${version})`,
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
