import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import type { AutomationsPlanResponse } from "../../../types/api.js";
import { appendDataSuffix } from "../../../utils/attribution.js";
import { validateAddress, validateChainId } from "../../../utils/validation.js";
import { AutomationsPlanOutput } from "../../output-schemas.js";
import {
  AUTOMATION_INTENT,
  CHAIN_ID_SCHEMA,
  POSITION_CONTEXT_SCHEMA,
  positionContext,
} from "./intents.js";
import { formatResult } from "./shared.js";

const INTENT_REFERENCE = [
  "Intents:",
  "- compound_fees: reinvest earned fees/rewards back into the LP. Optional 'tokens' scopes it per yielding token. A staked reward that is not a pool token is swapped in via CowSwap automatically.",
  "- claim_rewards: claim yield out. config.mode as_earned pays the tokens as-is, convert_to swaps them to config.buy_token via CowSwap. config.convert_tokens converts only a subset and claims the rest as-earned. config.destination account or wallet.",
  "- add_to_lp: fold idle pool-token balances (deposits, rebalance leftovers) back into the LP. Opt-in per token.",
  "- claim_merkl: auto-claim Merkl incentive rewards. Independent of the compounder/claimer/cowswapper triad and needs no position context.",
  "- rebalance: reposition the LP. strategy out_of_range (default), take_profit (runs on the dedicated profit-taker contract), or protocol_owned_liquidity.",
].join("\n");

const CONTEXT_NOTE =
  "Pass position_id (from assets[] in read.account.info) and the backend fills in protocol, is_staked, token0, token1 and reward_tokens for you; anything you pass explicitly wins. claim_merkl needs no position context.";

const RULES_NOTE = [
  "Rules the backend enforces (a violation is returned as an error, never written on-chain):",
  "- Every yielding token must be assigned to exactly one of compound_fees or claim_rewards. Scoping one to a subset without covering the rest is rejected, and no token may be in both.",
  "- A wallet or custom-recipient payout requires a pure as-earned claim: nothing converted, and every yielding token claimed. Converts settle in the account.",
  "- convert_tokens must be a subset of the claimed tokens, and buy_token cannot be a compounded token, a converted token, or an add_to_lp folded token.",
  "- Each intent kind may appear only once, and a token list must not be empty or name a token the position does not yield.",
].join("\n");

function planResult(
  description: string,
  resp: AutomationsPlanResponse,
  account: string,
  chainId: number,
  previewOnly = false,
) {
  // Only an explicit `true` counts as a passing simulation. The proxy returns
  // (url=None, success=False) when it could not run the sim at all (no `owner`),
  // and an absent success field is ambiguous, so neither may read as a green
  // light. An explicit `false` alongside a URL is a real predicted revert.
  const simStatus: "success" | "failure" | "unavailable" = !resp.simulation_url
    ? "unavailable"
    : resp.simulation_success === true
      ? "success"
      : resp.simulation_success === false
        ? "failure"
        : "unavailable";

  const base = {
    description,
    valid: resp.valid,
    errors: resp.errors ?? [],
    warnings: resp.warnings ?? [],
    human_summary: resp.human_summary ?? [],
    plan: resp.plan ?? [],
    ...(resp.diff ? { diff: resp.diff } : {}),
    ...(resp.simulation_url ? { simulation_url: resp.simulation_url } : {}),
    tenderly_sim_status: simStatus,
  };

  const rejected = (detail: string) => ({
    content: [
      {
        type: "text" as const,
        text: `Automation plan rejected: ${detail}\n\n${JSON.stringify(base, null, 2)}`,
      },
    ],
    isError: true as const,
  });

  // A failed compatibility rule is an error in either mode: the caller must see
  // why and fix the intents.
  if (!resp.valid) {
    const reasons = (resp.errors ?? []).map((e) => `${e.rule}: ${e.reason}`).join("; ");
    return rejected(reasons || "no reason given");
  }

  // Preview does not read chain state, so its calldata only enables the resolved
  // plan: it carries no disable entries for managers the account already has.
  // Broadcasting it would partially apply the requested state while leaving
  // unlisted automations running, and neither the empty-diff guard (no diff on
  // preview) nor the simulation guard (not enriched on preview) would catch it.
  // So preview returns the plan for inspection and no signable transaction.
  // Checked before calldata, which preview never uses: an intent set that
  // legitimately resolves to an empty plan (a single enabled: false intent) must
  // still preview cleanly.
  if (previewOnly) {
    return formatResult({
      ...base,
      preview_only: true,
      description: `${description}: preview only, no transaction. Preview does not diff against on-chain state, so its calldata would not disable automations you left out. Re-run with mode "save" to get a transaction.`,
    });
  }

  const calldata = resp.calldata;
  if (!calldata) {
    return rejected("the plan produced no calldata (nothing to change?)");
  }

  // An empty diff means the account already matches the request. The backend
  // still returns calldata for it, but that call is setAssetManagers([],[],[]):
  // handing it back would have the caller burn gas on a no-op and report a
  // change that never happened.
  const diff = resp.diff;
  if (diff && !diff.added.length && !diff.removed.length && !diff.updated.length) {
    return formatResult({
      ...base,
      no_changes_needed: true,
      description: `${description}: nothing to change, the account already matches this request. No transaction to send.`,
    });
  }

  // A simulation that ran and predicted a revert must not be handed back as a
  // signable transaction, matching the guard on the batched write tools.
  if (simStatus === "failure") {
    return {
      content: [
        {
          type: "text" as const,
          text:
            `Error: setAssetManagers simulation FAILED, do NOT broadcast.\nTenderly simulation: ${resp.simulation_url}\n\n` +
            JSON.stringify(base, null, 2),
        },
      ],
      isError: true as const,
    };
  }

  return formatResult({
    ...base,
    transaction: {
      to: account,
      data: appendDataSuffix(calldata),
      value: "0",
      chainId,
    },
  });
}

function errorResult(err: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
    isError: true as const,
  };
}

export function registerAutomationsTools(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write.account.automations",
    {
      annotations: {
        title: "Configure Account Automations",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Configure an account's automations from a list of intents and return the unsigned setAssetManagers transaction. " +
        "The backend resolves which asset managers each intent needs, validates that the combination is compatible, encodes the metadata and builds the calldata, so you describe the desired outcome rather than the contracts.\n\n" +
        "With mode 'save' (the default) the intents array is the complete desired state: the backend diffs it against what is currently enabled, so any automation you leave out is DISABLED by the returned transaction. Pass a single intent with enabled: false to turn everything off.\n\n" +
        "Mode 'preview' validates and resolves the intents WITHOUT reading chain state and returns no transaction, because its calldata carries no disable entries and would only partially apply the state. Use it to check a combination is legal or to show a plan; use 'save' to get something signable. To toggle one automation without restating the rest, use write.account.automations_delta.\n\n" +
        INTENT_REFERENCE +
        "\n\n" +
        CONTEXT_NOTE +
        "\n\n" +
        RULES_NOTE +
        "\n\nReturns { valid, errors, warnings, human_summary, plan, diff, transaction }. When a compatibility rule fires the call returns an error and no transaction: read errors[].reason, adjust the intents and retry. " +
        "There is deliberately no transaction when the account already matches the request (no_changes_needed), when the Tenderly simulation predicts a revert (an error), or in preview mode (preview_only). " +
        "Call read.asset_manager.intents first to see which intents this account can enable.",
      outputSchema: AutomationsPlanOutput,
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        intents: z
          .array(AUTOMATION_INTENT)
          .min(1)
          .describe(
            "Complete desired automation state. In save mode anything omitted is disabled, so include every automation to keep. A single intent with enabled: false disables all automations.",
          ),
        mode: z
          .enum(["save", "preview"])
          .default("save")
          .describe(
            "save diffs against on-chain state and returns a signable transaction that also disables anything omitted. preview resolves and validates only, returning a plan and no transaction.",
          ),
        ...POSITION_CONTEXT_SCHEMA,
        chain_id: CHAIN_ID_SCHEMA,
      },
    },
    async (params) => {
      try {
        const chainId = validateChainId(params.chain_id);
        const account = validateAddress(params.account_address, "account_address");
        const body = { intents: params.intents, ...positionContext(params) };

        const resp =
          params.mode === "preview"
            ? await api.previewAutomations(account, chainId, body)
            : await api.saveAutomations(account, chainId, body);

        const kinds = params.intents.map((i) => i.kind).join(", ");
        return planResult(
          `Configure automations on ${account} (${kinds})`,
          resp,
          account,
          chainId,
          params.mode === "preview",
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "write.account.automations_delta",
    {
      annotations: {
        title: "Change Account Automations (Delta)",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Apply an explicit change to an account's automations and return the unsigned setAssetManagers transaction. " +
        "Unlike write.account.automations this is a delta, not a full desired state: automations you do not mention are left untouched. Use it to switch one automation on or off without restating the others.\n\n" +
        "The enable array takes intents to switch on (same shapes as write.account.automations). To turn an automation OFF, call read.asset_manager.current, take the address of the manager serving it, and pass that address in the disable array: an intent with enabled: false in `enable` is rejected because the backend would ignore it. Superseded or unreadable managers still set on the account are force-disabled in the same transaction regardless.\n\n" +
        INTENT_REFERENCE +
        "\n\n" +
        CONTEXT_NOTE +
        "\n\n" +
        RULES_NOTE,
      outputSchema: AutomationsPlanOutput,
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        enable: z
          .array(AUTOMATION_INTENT)
          .default([])
          .describe(
            "Intents to switch on. Leave empty when only disabling. This array cannot turn anything off: an entry with enabled: false is rejected, use `disable` instead.",
          ),
        disable: z
          .array(z.string())
          .default([])
          .describe(
            "Asset-manager addresses to switch off, as returned by read.asset_manager.current.",
          ),
        ...POSITION_CONTEXT_SCHEMA,
        chain_id: CHAIN_ID_SCHEMA,
      },
    },
    async (params) => {
      try {
        const chainId = validateChainId(params.chain_id);
        const account = validateAddress(params.account_address, "account_address");

        if (params.enable.length === 0 && params.disable.length === 0) {
          throw new Error("Pass at least one intent in `enable` or one address in `disable`.");
        }

        // The backend resolves only enabled intents, so an `enabled: false` entry
        // here would be dropped and the delta would silently do nothing. Turning
        // an automation off is done by address via `disable`.
        const disabledEntries = params.enable.filter((i) => i.enabled === false);
        if (disabledEntries.length > 0) {
          const kinds = disabledEntries.map((i) => i.kind).join(", ");
          throw new Error(
            `enable[] cannot carry enabled: false (got ${kinds}); it would be ignored and change nothing. ` +
              `To turn an automation off, call read.asset_manager.current, take the address of the manager serving it, ` +
              `and pass that address in \`disable\`. Alternatively call write.account.automations with the full set of intents you want kept.`,
          );
        }

        const disable = params.disable.map((a, i) => validateAddress(a, `disable[${i}]`));
        const resp = await api.applyAutomationsDelta(account, chainId, {
          enable: params.enable,
          disable,
          ...positionContext(params),
        });

        const parts = [
          params.enable.length ? `enable ${params.enable.map((i) => i.kind).join(", ")}` : "",
          disable.length ? `disable ${disable.length} manager(s)` : "",
        ].filter(Boolean);

        return planResult(
          `Change automations on ${account} (${parts.join("; ")})`,
          resp,
          account,
          chainId,
        );
      } catch (err) {
        return errorResult(err);
      }
    },
  );
}
