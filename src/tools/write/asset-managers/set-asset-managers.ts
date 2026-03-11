import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../../config/chains.js";
import { accountAbi } from "../../../abis/index.js";
import { appendDataSuffix } from "../../../utils/attribution.js";
import { validateAddress, validateChainId } from "../../../utils/validation.js";

export function registerSetAssetManagersTool(
  server: McpServer,
  _chains: Record<ChainId, ChainConfig>,
) {
  server.registerTool(
    "write.account.set_asset_managers",
    {
      annotations: {
        title: "Build Set Asset Managers Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      description:
        "Build an unsigned setAssetManagers transaction from encoded intent args. Takes the { asset_managers, statuses, datas } arrays returned by write.asset_managers.* intent tools and builds a single unsigned tx targeting the account. To combine multiple automations in one tx, concatenate the arrays from multiple intent tool calls before passing them here. Example: to enable rebalancer + merkl_operator, call both intent tools, merge their arrays, then pass the merged arrays to this tool. Returns { description, asset_managers: [{address, enabled}], transaction: { to, data, value, chainId } }.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address (V3 or V4)"),
        asset_managers: z.array(z.string()).describe("Asset manager addresses from intent tools"),
        statuses: z.array(z.boolean()).describe("Enable/disable flags from intent tools"),
        datas: z
          .array(z.string())
          .describe("Encoded callback data from intent tools (hex strings)"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        validateChainId(params.chain_id);
        const validAccount = validateAddress(params.account_address, "account_address");

        if (
          params.asset_managers.length !== params.statuses.length ||
          params.asset_managers.length !== params.datas.length
        ) {
          throw new Error(
            `Array lengths must match: asset_managers(${params.asset_managers.length}), statuses(${params.statuses.length}), datas(${params.datas.length})`,
          );
        }

        if (params.asset_managers.length === 0) {
          throw new Error("At least one asset manager must be provided");
        }

        const validAddresses = params.asset_managers.map((a, i) =>
          validateAddress(a, `asset_managers[${i}]`),
        );

        const data = appendDataSuffix(
          encodeFunctionData({
            abi: accountAbi,
            functionName: "setAssetManagers",
            args: [validAddresses, params.statuses, params.datas.map((d) => d as `0x${string}`)],
          }),
        );

        const details = params.asset_managers.map((addr, i) => ({
          address: addr,
          enabled: params.statuses[i],
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: `Set ${params.asset_managers.length} asset manager(s) on account ${params.account_address}`,
                  asset_managers: details,
                  transaction: {
                    to: validAccount,
                    data,
                    value: "0",
                    chainId: params.chain_id,
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
