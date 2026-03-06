import { z } from "zod";
import { formatUnits } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { erc20Abi } from "../../abis/index.js";
import { getPublicClient } from "../../clients/chain.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";

const MAX_UINT256 = 2n ** 256n - 1n;

export function registerAllowanceTools(server: McpServer, chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "get_allowance",
    {
      annotations: {
        title: "Get Token Allowance",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Check ERC20 token allowances for a spender address. Use before build_approve_tx to avoid redundant approvals — skip approving if the current allowance is already sufficient.",
      inputSchema: {
        owner_address: z.string().describe("Token owner address (the wallet granting approval)"),
        spender_address: z
          .string()
          .describe("Spender address to check allowance for (e.g. Arcadia account address)"),
        token_addresses: z.array(z.string()).describe("ERC20 token contract addresses to check"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ owner_address, spender_address, token_addresses, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        const owner = validateAddress(owner_address, "owner_address");
        const spender = validateAddress(spender_address, "spender_address");
        const client = getPublicClient(validChainId, chains);

        const calls = token_addresses.flatMap((addr) => [
          {
            address: addr as `0x${string}`,
            abi: erc20Abi,
            functionName: "allowance" as const,
            args: [owner, spender],
          },
          { address: addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" as const },
          { address: addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" as const },
        ]);

        const results = (await client.multicall({ contracts: calls, allowFailure: true })) as {
          status: string;
          result?: unknown;
        }[];

        const tokens = token_addresses.map((addr, i) => {
          const allowRes = results[i * 3];
          const decRes = results[i * 3 + 1];
          const symRes = results[i * 3 + 2];

          const allowance = allowRes?.status === "success" ? BigInt(allowRes.result as bigint) : 0n;
          const decimals = decRes?.status === "success" ? Number(decRes.result) : 18;
          const symbol = symRes?.status === "success" ? String(symRes.result) : "???";

          return {
            address: addr,
            symbol,
            decimals,
            allowance: String(allowance),
            formatted: formatUnits(allowance, decimals),
            is_max_approval: allowance === MAX_UINT256,
          };
        });

        return { content: [{ type: "text" as const, text: JSON.stringify({ tokens }, null, 2) }] };
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
