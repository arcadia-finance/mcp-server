import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../../config/chains.js";
import { getAmProtocolAddress, getStandaloneAmAddress } from "../../../config/addresses.js";
import { validateAddress, validateChainId } from "../../../utils/validation.js";
import {
  CLAIMER_INITIATOR,
  COWSWAPPER_INITIATOR,
  encodeYieldClaimerCallbackData,
  encodeYieldClaimerCoupledCallbackData,
  encodeCowSwapTokenMetadata,
  disabledIntent,
} from "./encoding.js";
import { POOL_PROTOCOL_SCHEMA, poolProtocolToAmKey, formatResult } from "./shared.js";

export function registerYieldClaimerTools(
  server: McpServer,
  _chains: Record<ChainId, ChainConfig>,
) {
  server.registerTool(
    "write.asset_managers.yield_claimer",
    {
      annotations: {
        title: "Encode Yield Claimer Automation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Encode args for the standalone yield claimer automation. Periodically claims pending fees/emissions and sends them to a designated recipient (wallet, another account, or any address). Returns { asset_managers, statuses, datas } — pass to write.account.set_asset_managers. Combinable with other intent tools.",
      inputSchema: {
        pool_protocol: POOL_PROTOCOL_SCHEMA,
        fee_recipient: z
          .string()
          .describe("Address to receive claimed fees (wallet address or any destination)"),
        enabled: z.boolean().default(true).describe("True to enable, false to disable"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validChainId = validateChainId(params.chain_id);
        const amKey = poolProtocolToAmKey(params.pool_protocol);
        const amAddress = getAmProtocolAddress(validChainId, "yieldClaimers", amKey);

        if (!params.enabled) return formatResult(disabledIntent([amAddress]));

        const validFeeRecipient = validateAddress(params.fee_recipient, "fee_recipient");
        const callbackData = encodeYieldClaimerCallbackData(CLAIMER_INITIATOR, validFeeRecipient);

        const result = {
          asset_managers: [amAddress],
          statuses: [true],
          datas: [callbackData],
          summary: {
            pool_protocol: params.pool_protocol,
            fee_recipient: params.fee_recipient,
          },
        };
        return formatResult(result);
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
    "write.asset_managers.yield_claimer_cowswap",
    {
      annotations: {
        title: "Encode Yield Claimer + CowSwap Automation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Encode args for yield claimer coupled with CowSwap. Claims LP fees, then swaps the claimed tokens to a target token via CowSwap batch auctions (MEV-protected). For staked LPs, sell_tokens is typically [AERO]. For non-staked LPs, sell_tokens is [token0, token1] excluding the buy_token. Sets metadata on BOTH the CowSwapper and the Yield Claimer. Returns { asset_managers, statuses, datas } with 2 entries (cowswapper + yield_claimer). Combinable with other intent tools.",
      inputSchema: {
        pool_protocol: POOL_PROTOCOL_SCHEMA,
        sell_tokens: z
          .array(z.string())
          .describe(
            "Token addresses to sell. Staked LP: [AERO]. Non-staked: [token0, token1] minus buy_token.",
          ),
        buy_token: z.string().describe("Token address to receive after swap"),
        fee_recipient: z.string().describe("Address to receive claimed fees"),
        enabled: z.boolean().default(true).describe("True to enable, false to disable"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validChainId = validateChainId(params.chain_id);
        const amKey = poolProtocolToAmKey(params.pool_protocol);
        let cowSwapperAddress: string;
        try {
          cowSwapperAddress = getStandaloneAmAddress(validChainId, "cowSwapper");
        } catch {
          throw new Error(
            `yield_claimer_cowswap is not available on chain ${validChainId} because it requires cow_swapper, which is Base-only (8453).`,
          );
        }
        const yieldClaimerAddress = getAmProtocolAddress(validChainId, "yieldClaimers", amKey);

        if (!params.enabled) {
          return formatResult(disabledIntent([cowSwapperAddress, yieldClaimerAddress]));
        }

        const validSellTokens = params.sell_tokens.map((t, i) =>
          validateAddress(t, `sell_tokens[${i}]`),
        );
        const validBuyToken = validateAddress(params.buy_token, "buy_token");
        const validFeeRecipient = validateAddress(params.fee_recipient, "fee_recipient");

        const cowSwapperData = encodeCowSwapTokenMetadata(
          "cow_swap_yield_claim",
          validSellTokens,
          validBuyToken,
        );

        const yieldClaimerData = encodeYieldClaimerCoupledCallbackData(
          COWSWAPPER_INITIATOR,
          validFeeRecipient,
          "cow_swap_yield_claim",
        );

        const result = {
          asset_managers: [cowSwapperAddress, yieldClaimerAddress],
          statuses: [true, true],
          datas: [cowSwapperData, yieldClaimerData],
          summary: {
            pool_protocol: params.pool_protocol,
            sell_tokens: params.sell_tokens,
            buy_token: params.buy_token,
            fee_recipient: params.fee_recipient,
          },
        };
        return formatResult(result);
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
