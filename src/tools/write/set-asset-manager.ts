import { z } from "zod";
import { encodeFunctionData } from "viem";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { accountAbi } from "../../abis/index.js";
import { appendDataSuffix } from "../../utils/attribution.js";
import { validateAddress } from "../../utils/validation.js";

export function registerSetAssetManagerTool(
  server: McpServer,
  _chains: Record<ChainId, ChainConfig>,
) {
  server.registerTool(
    "build_set_asset_manager_tx",
    {
      description:
        "Build an unsigned transaction to grant or revoke an asset manager's permission on an Arcadia V3/V4 account via setAssetManagers. This ONLY toggles the permission flag — it does NOT configure initiator, fees, or strategy parameters. For full setup (enable + configure in one tx), use build_configure_asset_manager_tx instead. For asset manager addresses, call get_guide('automation'). Returns { transaction: { to, data, value, chainId } }.",
      inputSchema: {
        account_address: z.string().describe("Arcadia account address (V3 or V4)"),
        asset_manager_address: z
          .string()
          .describe("Asset manager contract address to grant or revoke"),
        enabled: z.boolean().describe("True to grant permission, false to revoke"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async (params) => {
      try {
        const validAccount = validateAddress(params.account_address, "account_address");
        const validAm = validateAddress(params.asset_manager_address, "asset_manager_address");

        const data = appendDataSuffix(
          encodeFunctionData({
            abi: accountAbi,
            functionName: "setAssetManagers",
            args: [[validAm], [params.enabled], ["0x"]],
          }),
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description: `${params.enabled ? "Grant" : "Revoke"} asset manager permission for ${params.asset_manager_address}`,
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
