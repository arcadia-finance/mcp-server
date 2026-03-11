import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../../config/chains.js";
import { getAmProtocolAddress, getStandaloneAmAddress } from "../../../config/addresses.js";
import { validateAddress, validateChainId } from "../../../utils/validation.js";
import {
  COMPOUNDER_INITIATOR,
  COWSWAPPER_INITIATOR,
  encodeCompounderCallbackData,
  encodeCompounderCoupledCallbackData,
  encodeCowSwapTokenMetadata,
  disabledIntent,
  type EncodedIntent,
} from "./encoding.js";
import { POOL_PROTOCOL_SCHEMA, poolProtocolToAmKey, formatResult } from "./shared.js";

export function registerCompounderTools(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "write.asset_managers.compounder",
    {
      annotations: {
        title: "Encode Compounder Automation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Encode args for the standalone compounder automation. Claims accumulated LP fees and reinvests them back into the position (compound interest). When paired with a rebalancer, the rebalancer compounds at rebalance time — adding a compounder also compounds between rebalances for higher effective APY. Returns { asset_managers, statuses, datas } — pass to write.account.set_asset_managers. Combinable with other intent tools.",
      inputSchema: {
        pool_protocol: POOL_PROTOCOL_SCHEMA,
        enabled: z.boolean().default(true).describe("True to enable, false to disable"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validChainId = validateChainId(params.chain_id);
        const amKey = poolProtocolToAmKey(params.pool_protocol);
        const amAddress = getAmProtocolAddress(validChainId, "compounders", amKey);

        if (!params.enabled) return formatResult(disabledIntent([amAddress]));

        const callbackData = encodeCompounderCallbackData(COMPOUNDER_INITIATOR);
        const result: EncodedIntent = {
          asset_managers: [amAddress],
          statuses: [true],
          datas: [callbackData],
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
    "write.asset_managers.compounder_staked",
    {
      annotations: {
        title: "Encode Compounder + CowSwap Automation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Encode args for compounder coupled with CowSwap. Claims staked CL rewards (typically AERO), swaps them to a target token via CowSwap batch auctions (MEV-protected), then compounds back into the LP position. Sets metadata on BOTH the CowSwapper and the Compounder in a single call. sell_tokens is typically [AERO] for staked positions. buy_token should be a major token in the pair (USDC, WETH, cbBTC). Returns { asset_managers, statuses, datas } with 2 entries (cowswapper + compounder). Combinable with other intent tools.",
      inputSchema: {
        pool_protocol: POOL_PROTOCOL_SCHEMA,
        sell_tokens: z
          .array(z.string())
          .describe("Token addresses to sell via CowSwap (typically [AERO] for staked positions)"),
        buy_token: z
          .string()
          .describe(
            "Token address to buy — should be a major token in the pair (USDC, WETH, cbBTC)",
          ),
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
            `compounder_staked is not available on chain ${validChainId} because it requires cow_swapper, which is Base-only (8453).`,
          );
        }
        const compounderAddress = getAmProtocolAddress(validChainId, "compounders", amKey);

        if (!params.enabled) {
          return formatResult(disabledIntent([cowSwapperAddress, compounderAddress]));
        }

        const validSellTokens = params.sell_tokens.map((t, i) =>
          validateAddress(t, `sell_tokens[${i}]`),
        );
        const validBuyToken = validateAddress(params.buy_token, "buy_token");

        const cowSwapperData = encodeCowSwapTokenMetadata(
          "cow_swap_compound",
          validSellTokens,
          validBuyToken,
        );

        const compounderData = encodeCompounderCoupledCallbackData(
          COWSWAPPER_INITIATOR,
          "cow_swap_compound",
        );

        const result: EncodedIntent = {
          asset_managers: [cowSwapperAddress, compounderAddress],
          statuses: [true, true],
          datas: [cowSwapperData, compounderData],
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
