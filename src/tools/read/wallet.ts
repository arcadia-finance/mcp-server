import { z } from "zod";
import { formatUnits } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { erc20Abi } from "../../abis/index.js";
import { getPublicClient } from "../../clients/chain.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";
import {
  WalletBalancesOutput,
  WalletAllowanceOutput,
  AccountListOutput,
  PointsWalletOutput,
} from "../output-schemas.js";

const MAX_UINT256 = 2n ** 256n - 1n;

export function registerWalletTools(
  server: McpServer,
  chains: Record<ChainId, ChainConfig>,
  api: ArcadiaApiClient,
) {
  server.registerTool(
    "read.wallet.balances",
    {
      annotations: {
        title: "Get Wallet Balances",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get native ETH and ERC20 token balances for a wallet address. Reads directly from chain via RPC multicall. Use before write.account.add_liquidity or write.account.deposit to verify the wallet has sufficient tokens. Returns both raw balance (smallest unit/wei) and formatted (human-readable) per token.",
      inputSchema: {
        wallet_address: z.string().describe("Wallet address to check balances for"),
        token_addresses: z.array(z.string()).describe("ERC20 token contract addresses to check"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: WalletBalancesOutput,
    },
    async ({ wallet_address, token_addresses, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        const wallet = validateAddress(wallet_address, "wallet_address");
        const client = getPublicClient(validChainId, chains);

        // Build multicall: for each token get balanceOf, decimals, symbol
        const calls = token_addresses.flatMap((addr) => [
          {
            address: addr as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf" as const,
            args: [wallet],
          },
          { address: addr as `0x${string}`, abi: erc20Abi, functionName: "decimals" as const },
          { address: addr as `0x${string}`, abi: erc20Abi, functionName: "symbol" as const },
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

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
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

  server.registerTool(
    "read.wallet.allowances",
    {
      annotations: {
        title: "Get Token Allowances",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Check ERC20 token allowances for a spender address. Use before write.wallet.approve to avoid redundant approvals — skip approving if the current allowance is already sufficient.",
      inputSchema: {
        owner_address: z.string().describe("Token owner address (the wallet granting approval)"),
        spender_address: z
          .string()
          .describe("Spender address to check allowance for (e.g. Arcadia account address)"),
        token_addresses: z.array(z.string()).describe("ERC20 token contract addresses to check"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: WalletAllowanceOutput,
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

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ tokens }, null, 2) }],
          structuredContent: { tokens },
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

  server.registerTool(
    "read.wallet.accounts",
    {
      annotations: {
        title: "List Wallet Accounts",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "List all Arcadia accounts owned by a wallet address. Returns a summary of each account (address, name). Call read.account.info with a specific account_address for full details like health factor, collateral, and debt.",
      inputSchema: {
        wallet_address: z.string().describe("Wallet address to list accounts for"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
      outputSchema: AccountListOutput,
    },
    async ({ wallet_address, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        validateAddress(wallet_address, "wallet_address");
        const result = await api.getAccounts(validChainId, wallet_address);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
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

  server.registerTool(
    "read.wallet.points",
    {
      annotations: {
        title: "Get Wallet Points",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description: "Get Arcadia points balance for a specific wallet address.",
      inputSchema: {
        wallet_address: z.string().describe("Wallet address to get points for"),
      },
      outputSchema: PointsWalletOutput,
    },
    async ({ wallet_address }) => {
      try {
        const result = await api.getPoints(wallet_address);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
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
