import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { appendDataSuffix } from "../../../utils/attribution.js";
import { parseWeiDecimalString, validateAddress } from "../../../utils/validation.js";
import { aeroErrorResult } from "../../aero.js";
import { VeloUpgradeOutput } from "../../output-schemas.js";

const OPTIMISM = 10;

export function registerUpgradeVeloTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write.wallet.upgrade_velo",
    {
      annotations: {
        title: "Build VELO Upgrade Transactions",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: VeloUpgradeOutput,
      description:
        "Upgrade VELO held in a wallet on Optimism to the new AERO on Base: ordered unsigned wallet transactions from owner_address, an approve when the allowance is short, then depositLiquid on the Velodrome migration with the Hyperlane fee as value. 0.044 new AERO per VELO arrives at the same address on Base once the message lands. " +
        "VELO inside an Arcadia account must be withdrawn to the wallet first (write.account.withdraw). VELO stays usable, so this is optional. Optimism (chain_id 10) only. 'upgrade unavailable' names the contract's reason: not_open (with the opening time), paused, budget_exhausted, recipient_not_deployed (a contract wallet with no code on Base).",
      inputSchema: {
        owner_address: z
          .string()
          .describe("Wallet holding the VELO on Optimism; receives the AERO on Base"),
        amount: z
          .string()
          .optional()
          .describe("Raw units (18 decimals). Omit for the wallet's full VELO balance."),
        chain_id: z.number().default(OPTIMISM).describe("Chain ID: 10 (Optimism)"),
      },
    },
    async ({ owner_address, amount, chain_id }) => {
      try {
        if (chain_id !== OPTIMISM) {
          throw new Error(
            `The VELO upgrade runs on Optimism (chain_id 10), not on chain ${chain_id}.`,
          );
        }
        const owner = validateAddress(owner_address, "owner_address");
        if (amount !== undefined) parseWeiDecimalString(amount, "amount");
        const result = await api.getUpgradeVeloCalldata({
          chain_id: OPTIMISM,
          owner_address: owner,
          amount,
        });
        if (BigInt(result.wallet_balance) < BigInt(result.amount_in)) {
          throw new Error(
            `${owner} holds ${result.wallet_balance} VELO on Optimism, less than the ${result.amount_in} requested; the deposit would revert.`,
          );
        }

        const last = result.calls.length - 1;
        const response = {
          description: `Upgrade ${result.amount_in} VELO on Optimism to ${result.expected_amount_out} new AERO on Base`,
          transactions: result.calls.map((call, i) => ({
            description:
              i === last
                ? `Deposit ${result.amount_in} VELO into the Velodrome migration (Hyperlane fee ${call.value} wei)`
                : `Approve the Velodrome migration ${result.migration} to spend ${result.amount_in} VELO`,
            transaction: {
              to: call.to,
              data: appendDataSuffix(call.data),
              value: call.value,
              chainId: result.chain_id,
            },
          })),
          destination_chain_id: result.destination_chain_id,
          recipient: result.recipient,
          old_token: result.old_token,
          new_token: result.new_token,
          amount_in: result.amount_in,
          expected_amount_out: result.expected_amount_out,
          fee_wei: result.fee_wei,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
          structuredContent: response,
        };
      } catch (err) {
        return aeroErrorResult(err);
      }
    },
  );
}
