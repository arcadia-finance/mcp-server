import { z } from "zod";
import { formatUnits } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { getPublicClient } from "../../clients/chain.js";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ type: "string" }],
    stateMutability: "view",
  },
] as const;

export function registerBalanceTools(server: McpServer, chains: Record<ChainId, ChainConfig>) {
  server.tool(
    "get_wallet_balances",
    "Get native ETH and ERC20 token balances for a wallet address. Reads directly from chain via RPC multicall. Use before build_add_liquidity_tx or build_deposit_tx to verify the wallet has sufficient tokens.",
    {
      wallet_address: z.string().describe("Wallet address to check balances for"),
      token_addresses: z.array(z.string()).describe("ERC20 token contract addresses to check"),
      chain_id: z
        .number()
        .default(8453)
        .describe("Chain ID: 8453 (Base), 10 (Optimism), or 130 (Unichain)"),
    },
    async ({ wallet_address, token_addresses, chain_id }) => {
      try {
        const client = getPublicClient(chain_id as ChainId, chains);
        const wallet = wallet_address as `0x${string}`;

        // Build multicall: for each token get balanceOf, decimals, symbol
        const calls = token_addresses.flatMap((addr) => [
          {
            address: addr as `0x${string}`,
            abi: ERC20_ABI,
            functionName: "balanceOf" as const,
            args: [wallet],
          },
          { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "decimals" as const },
          { address: addr as `0x${string}`, abi: ERC20_ABI, functionName: "symbol" as const },
        ]);

        const [nativeBalance, ...multicallResults] = await Promise.all([
          client.getBalance({ address: wallet }),
          ...(calls.length > 0 ? [client.multicall({ contracts: calls, allowFailure: true })] : []),
        ]);

        const results = (multicallResults[0] ?? []) as { status: string; result?: unknown }[];
        const tokens = token_addresses.map((addr, i) => {
          const balRes = results[i * 3];
          const decRes = results[i * 3 + 1];
          const symRes = results[i * 3 + 2];

          const balance = balRes?.status === "success" ? String(balRes.result) : "0";
          const decimals = decRes?.status === "success" ? Number(decRes.result) : 18;
          const symbol = symRes?.status === "success" ? String(symRes.result) : "???";

          return {
            address: addr,
            symbol,
            decimals,
            balance,
            formatted: formatUnits(BigInt(balance), decimals),
          };
        });

        const result = {
          native: {
            symbol: "ETH",
            balance: String(nativeBalance),
            formatted: formatUnits(nativeBalance, 18),
          },
          tokens,
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
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
