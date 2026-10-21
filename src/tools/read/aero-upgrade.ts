import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import { validateAddress } from "../../utils/validation.js";
import { aeroErrorResult, validateAeroChain } from "../aero.js";
import { AeroUpgradeCandidatesOutput } from "../output-schemas.js";

export function registerAeroUpgradeReadTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "read.account.aero_upgrade",
    {
      annotations: {
        title: "Check Aero Upgrade Candidates",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Which Arcadia accounts have something to upgrade to Aero (MetadexCL V1): Slipstream V1 to V3 positions (Aerodrome on Base, Velodrome on Optimism, staked or not) and old AERO. Pass wallet_address for every account of a wallet, or account_address for one. " +
        "Per account: status (ready | choices_required | waiting | not_open | nothing_to_upgrade), positions (every Slipstream position on it), movable (ready or needing a pool choice), waiting, blocked, old_aero (raw, 18 decimals). Accounts without a Slipstream position or old AERO are left out. failed_accounts lists the accounts whose check failed, with the error: an empty accounts list means nothing to do only when failed_accounts is empty too. Otherwise tell the user those accounts could not be checked and retry later. opens_at is when the AERO token upgrade opens on Base. " +
        "No calldata, prices or simulation: this is the cheap check. For the plan and the transaction call write.account.aero_upgrade. Chains: Base (8453), Optimism (10); Robinhood (4663) has no Slipstream positions and answers an empty list.",
      inputSchema: {
        wallet_address: z
          .string()
          .optional()
          .describe("Wallet whose accounts to check. Pass this or account_address, not both."),
        account_address: z.string().optional().describe("One Arcadia account to check"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 10 (Optimism)"),
      },
      outputSchema: AeroUpgradeCandidatesOutput,
    },
    async ({ wallet_address, account_address, chain_id }) => {
      try {
        if ((wallet_address === undefined) === (account_address === undefined)) {
          throw new Error("Pass exactly one of wallet_address and account_address.");
        }
        const chainId = validateAeroChain(chain_id);
        const result = await api.getAeroUpgradeCandidates({
          chain_id: chainId,
          owner_address:
            wallet_address === undefined
              ? undefined
              : validateAddress(wallet_address, "wallet_address"),
          account_address:
            account_address === undefined
              ? undefined
              : validateAddress(account_address, "account_address"),
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        return aeroErrorResult(err);
      }
    },
  );
}
