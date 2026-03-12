import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../../config/chains.js";
import { getStandaloneAmAddress } from "../../../config/addresses.js";
import { validateChainId } from "../../../utils/validation.js";
import { encodeOuterMetadata, disabledIntent } from "./encoding.js";
import { IntentOutput } from "../../output-schemas.js";
import { formatResult } from "./shared.js";

export function registerCowSwapperTool(server: McpServer, _chains: Record<ChainId, ChainConfig>) {
  server.registerTool(
    "write.asset_manager.cow_swapper",
    {
      annotations: {
        title: "Encode Direct CowSwap Automation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Encode args for standalone direct CowSwap mode. Enables the CowSwapper to swap any ERC20 → ERC20 via CoW Protocol batch auctions (MEV-protected). Unlike compounder_staked or yield_claimer_cowswap, this is NOT coupled to any other automation — each swap requires an additional signature from the account owner. Only available on Base (8453). Returns { asset_managers, statuses, datas } — pass to write.account.set_asset_managers. Combinable with other intent tools.",
      outputSchema: IntentOutput,
      inputSchema: {
        enabled: z.boolean().default(true).describe("True to enable, false to disable"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base)"),
      },
    },
    async (params) => {
      try {
        const validChainId = validateChainId(params.chain_id);
        const cowSwapperAddress = getStandaloneAmAddress(validChainId, "cowSwapper");

        if (!params.enabled)
          return formatResult(disabledIntent([cowSwapperAddress], "Disable cow_swapper"));

        const cowSwapperData = encodeOuterMetadata("cow_swap_direct", "0x");
        const result = {
          description: "Enable cow_swapper (direct mode)",
          asset_managers: [cowSwapperAddress],
          statuses: [true],
          datas: [cowSwapperData],
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
