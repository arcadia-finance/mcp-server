import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../../config/chains.js";
import { getStandaloneAmAddress } from "../../../config/addresses.js";
import { validateAddress, validateChainId } from "../../../utils/validation.js";
import { MERKL_INITIATOR, encodeMerklOperatorCallbackData, disabledIntent } from "./encoding.js";
import { formatResult } from "./shared.js";

export function registerMerklOperatorTool(
  server: McpServer,
  _chains: Record<ChainId, ChainConfig>,
) {
  server.registerTool(
    "write.asset_managers.merkl_operator",
    {
      annotations: {
        title: "Encode Merkl Operator Automation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Encode args for the Merkl operator automation. Claims external Merkl protocol incentive rewards into the account — additional rewards paid by token teams on top of regular LP fees. Enable when the pool has active Merkl campaigns (check APY breakdown in read.strategy.list). Always combine with rebalancer when both are relevant — no conflict, extra free yield. Returns { description, asset_managers, statuses, datas } — pass to write.account.set_asset_managers. Combinable with other intent tools.",
      inputSchema: {
        reward_recipient: z.string().describe("Address to receive Merkl rewards"),
        enabled: z.boolean().default(true).describe("True to enable, false to disable"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validChainId = validateChainId(params.chain_id);
        const amAddress = getStandaloneAmAddress(validChainId, "merklOperator");

        if (!params.enabled)
          return formatResult(disabledIntent([amAddress], "Disable merkl_operator"));

        const validRewardRecipient = validateAddress(params.reward_recipient, "reward_recipient");
        const callbackData = encodeMerklOperatorCallbackData(MERKL_INITIATOR, validRewardRecipient);

        const result = {
          description: "Enable merkl_operator",
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
}
