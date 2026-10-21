import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { validateAddress } from "../../../utils/validation.js";
import {
  aeroErrorResult,
  formatUpgradePlan,
  simulationFailedResult,
  simulationReverted,
  validateAeroChain,
} from "../../aero.js";
import { AeroUpgradeOutput } from "../../output-schemas.js";

const BATCH_MAX_ACCOUNTS = 10;

const choiceSchema = z.object({
  position_manager: z.string().describe("The position's source.position_manager"),
  position_id: z.number().int().describe("The position's source.position_id"),
  pool: z.string().describe("The chosen option's pool"),
});

type Choice = z.infer<typeof choiceSchema>;

function choiceStrings(choices: Choice[] | undefined): string[] | undefined {
  if (!choices || choices.length === 0) return undefined;
  return choices.map(
    (c) =>
      `${validateAddress(c.position_manager, "choices[].position_manager")}:${c.position_id}:${validateAddress(c.pool, "choices[].pool")}`,
  );
}

export function registerAeroUpgradeTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write_account_aero_upgrade",
    {
      annotations: {
        title: "Build Aero Upgrade Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: AeroUpgradeOutput,
      description:
        "Upgrade one Arcadia account to Aero (MetadexCL V1) in one flashAction: every Slipstream V1/V2/V3 position (dex_protocol slipstream*, staked or not, see read_account_info) moves to the Aero CL pool with the same pair and variant at the same range and tick spacing (when Aero has no pool at that tick spacing, the user picks another one), and every unit of old AERO (loose, in rewards, in an old-AERO pair) becomes the new AERO. Returns the plan and, when anything can go now, the unsigned transaction. Only the account owner can sign it. " +
        "The backend decides what moves: report items[].status and items[].reason as given, never decide eligibility yourself. status ready: sign transaction. choices_required: some position has status choose with options[] (every Aero pool on its pair, with apy, tvl_usd, is_new, tick_spacing, range_widened, default and disabled_reason); pick one whose disabled_reason is null, ask the user when unsure, and call again with it in choices. A transaction returned with choices_required moves only the ready items, and the choose items stay where they are until the call with choices. Once that transaction is signed, a call made before it confirms is built on the old state, so wait for the confirmation before calling again. Without a transaction there is nothing to sign yet. waiting: nothing can move yet, each item's reason says why (pool_not_on_aero, staking_not_open, target_price_mismatch, account_unhealthy, ...), do not retry in a loop. not_open: the AERO upgrade opens at opens_at. " +
        "Pass accounts (up to 10) instead of account_address for one plan per account; the accounts share one AERO upgrade budget. multisends groups the accounts that got a transaction, in order: a Safe signs one MultiSend per group (each below max_gas_per_tx). After it confirms, reconnect managers_to_reconnect with write_account_automations and verify with read_account_info (next_steps). " +
        "Spot and margin accounts can hold Aero positions, staked or not. Chains: 8453 (Base, default) and 10 (Optimism). Calldata is time-sensitive: sign promptly, rebuild on a price revert. When the transaction's simulation reverts the tool returns an error and no transaction; tenderly_sim_status unavailable means Tenderly did not answer and the transaction is returned unsimulated. A plan without a transaction can still show tenderly_sim_status failure: the account's health or a lending pool limit refused the move, and the items wait on account_unhealthy or exposure_limit; report those reasons and do not rebuild.",
      inputSchema: z.object({
        account_address: z
          .string()
          .optional()
          .describe("Arcadia account to upgrade. Pass this or accounts, not both."),
        accounts: z
          .array(z.string())
          .min(1)
          .max(BATCH_MAX_ACCOUNTS)
          .optional()
          .describe(
            `Up to ${BATCH_MAX_ACCOUNTS} Arcadia accounts of one owner: one plan and transaction each`,
          ),
        choices: z
          .array(choiceSchema)
          .optional()
          .describe(
            "Pool picks for positions with status choose, from a previous call's options (disabled_reason null)",
          ),
        slippage: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe(
            "Price band the mint accepts, in bps. Omit for the backend default: 150, or 500 when the owner is a contract (a Safe).",
          ),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 10 (Optimism)"),
      }),
    },
    async ({ account_address, accounts, choices, slippage, chain_id }) => {
      try {
        if ((account_address === undefined) === (accounts === undefined)) {
          throw new Error("Pass exactly one of account_address and accounts.");
        }
        if (
          accounts !== undefined &&
          (accounts.length === 0 || accounts.length > BATCH_MAX_ACCOUNTS)
        ) {
          throw new Error(`accounts takes 1 to ${BATCH_MAX_ACCOUNTS} Arcadia accounts.`);
        }
        const chainId = validateAeroChain(chain_id);
        const picks = choiceStrings(choices);

        let response: Record<string, unknown>;
        if (account_address !== undefined) {
          const plan = await api.getAeroUpgradePlan({
            chain_id: chainId,
            account_address: validateAddress(account_address, "account_address"),
            choices: picks,
            slippage,
          });
          if (plan.calls.length > 0 && simulationReverted(plan.simulation)) {
            return simulationFailedResult(plan.simulation);
          }
          response = formatUpgradePlan(plan, chainId);
        } else {
          const batch = await api.postAeroUpgradeBatch({
            chain_id: chainId,
            accounts: accounts!.map((a) => validateAddress(a, "accounts[]")),
            choices: picks,
            slippage,
          });
          const results = batch.results.map((result) =>
            result.status === "error" ? result : formatUpgradePlan(result, chainId),
          );
          const withTx = new Set(
            results.filter((r) => "transaction" in r).map((r) => r.account_address),
          );
          const multisends = batch.multisends
            .map((group) => group.filter((account) => withTx.has(account)))
            .filter((group) => group.length > 0);
          response = {
            description: `Upgrade ${accounts!.length} account${accounts!.length === 1 ? "" : "s"} to Aero: ${withTx.size} transaction${withTx.size === 1 ? "" : "s"} to sign`,
            chain_id: batch.chain_id,
            max_gas_per_tx: batch.max_gas_per_tx,
            multisends,
            results,
            next_steps: [
              "Each result's transaction is a flashAction on its own account. multisends lists the accounts with a transaction in groups: a Safe signs one MultiSend per group, in order, with the transactions of that group's accounts. A result with status error or without a transaction is reported as is.",
            ],
          };
        }
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
