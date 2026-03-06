import { z } from "zod";
import { encodeFunctionData, keccak256, concat, pad, toBytes, getAddress, slice } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { factoryAbi } from "../../abis/index.js";
import { PROTOCOL } from "../../config/addresses.js";
import { getPublicClient } from "../../clients/chain.js";
import { appendDataSuffix } from "../../utils/attribution.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";

// Arcadia Proxy bytecode from CreateProxyLib.sol — used to compute CREATE2 addresses.
const PROXY_BYTECODE =
  "0x608060405260405161017c38038061017c8339810160408190526100229161008d565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc80546001600160a01b0319166001600160a01b0383169081179091556040517fbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b905f90a2506100ba565b5f6020828403121561009d575f80fd5b81516001600160a01b03811681146100b3575f80fd5b9392505050565b60b6806100c65f395ff3fe608060405236603c57603a7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5b546001600160a01b03166063565b005b603a7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc602c565b365f80375f80365f845af43d5f803e808015607c573d5ff35b3d5ffdfea2646970667358221220eeb8a2fa918a2057b66e1d3fa3930647dc7a4e56c99898cd9e280beec9d9ba9f64736f6c63430008160033000000000000000000000000" as `0x${string}`;

export function computeAccountAddress(
  factoryAddress: `0x${string}`,
  userSalt: number,
  walletAddress: `0x${string}`,
  implementation: `0x${string}`,
): `0x${string}` {
  // Salt = keccak256(abi.encodePacked(uint32(userSalt), uint32(uint160(tx.origin))))
  // tx.origin = wallet address; take lowest 32 bits
  const walletLower32 = Number(BigInt(walletAddress) & 0xffffffffn);
  const saltBytes = concat([
    pad(toBytes(userSalt), { size: 4 }),
    pad(toBytes(walletLower32), { size: 4 }),
  ]);
  const salt = keccak256(saltBytes);

  // Bytecode = PROXY_BYTECODE ++ implementation (abi.encodePacked → 20 bytes for address)
  // PROXY_BYTECODE already ends with 12 zero bytes (left-padding for the constructor arg)
  const bytecode = concat([PROXY_BYTECODE, implementation]);
  const bytecodeHash = keccak256(bytecode);

  // CREATE2: keccak256(0xff ++ factory ++ salt ++ keccak256(bytecode))[12:]
  const raw = keccak256(
    concat([toBytes("0xff"), toBytes(factoryAddress), toBytes(salt), toBytes(bytecodeHash)]),
  );
  return getAddress(slice(raw, 12));
}

export function registerCreateAccountTool(server: McpServer, chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "build_create_account_tx",
    {
      annotations: {
        title: "Build Create Account Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Build an unsigned transaction to create a new Arcadia account via the Factory contract. account_version: 3 with creditor → V3 margin account (can borrow/leverage). account_version: 0 or 4 → V4 spot account (no borrowing, creditor is ignored, any ERC20 allowed). Returns the predicted account address (deterministic via CREATE2).",
      inputSchema: {
        salt: z.number().describe("Unique salt (uint32) for deterministic account address"),
        wallet_address: z
          .string()
          .describe(
            "Wallet address that will send the transaction (tx.origin, needed for address prediction)",
          ),
        account_version: z
          .number()
          .default(0)
          .describe(
            "Account version: 0 = latest (V4 spot), 3 = margin (can borrow). 1/2 = legacy.",
          ),
        creditor: z
          .string()
          .optional()
          .describe(
            "Lending pool address for V3 margin account. Ignored for V4 spot accounts (version 0 or 4).",
          ),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validChainId = validateChainId(params.chain_id);
        const validWallet = validateAddress(params.wallet_address, "wallet_address");

        const data = appendDataSuffix(
          encodeFunctionData({
            abi: factoryAbi,
            functionName: "createAccount",
            args: [
              params.salt,
              BigInt(params.account_version),
              params.creditor
                ? validateAddress(params.creditor, "creditor")
                : ("0x0000000000000000000000000000000000000000" as `0x${string}`),
            ],
          }),
        );

        // Try to predict the account address via CREATE2 (requires RPC)
        let predictedAddress: string | undefined;
        try {
          const client = getPublicClient(validChainId, chains);
          let resolvedVersion = BigInt(params.account_version);
          if (resolvedVersion === 0n) {
            resolvedVersion = (await client.readContract({
              address: PROTOCOL.factory as `0x${string}`,
              abi: factoryAbi,
              functionName: "latestAccountVersion",
            })) as bigint;
          }
          const versionInfo = (await client.readContract({
            address: PROTOCOL.factory as `0x${string}`,
            abi: factoryAbi,
            functionName: "versionInformation",
            args: [resolvedVersion],
          })) as [string, string, string];
          predictedAddress = computeAccountAddress(
            PROTOCOL.factory as `0x${string}`,
            params.salt,
            validWallet,
            versionInfo[1] as `0x${string}`,
          );
        } catch {
          // RPC unavailable — skip address prediction
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: "Create a new Arcadia account",
                  transaction: {
                    to: PROTOCOL.factory,
                    data,
                    value: "0",
                    chainId: validChainId,
                  },
                  ...(predictedAddress && { predicted_account_address: predictedAddress }),
                  next_steps: predictedAddress
                    ? "The new account will be at predicted_account_address after tx confirms. You can use it immediately without waiting for indexing."
                    : "After tx confirms, call get_account_info with wallet_address to find the new account. Note: there may be a short indexing delay.",
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
