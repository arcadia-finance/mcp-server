import { ArcadiaApiError } from "../clients/api.js";
import type {
  AeroManagerToReconnect,
  AeroSimulation,
  AeroUpgradePlanResponse,
} from "../types/api.js";
import { appendDataSuffix } from "../utils/attribution.js";
import { isSimulationFailed, normalizeSimStatus } from "./write/account/format-response.js";

/** Chains the Aero upgrade endpoints answer for. Robinhood has no Slipstream positions, so it answers an empty list. */
export const AERO_UPGRADE_CHAINS = [8453, 10, 4663] as const;

export function validateAeroChain(chainId: number): number {
  if (!(AERO_UPGRADE_CHAINS as readonly number[]).includes(chainId)) {
    throw new Error(
      `Aero upgrades exist on Base (8453), Optimism (10) and Robinhood (4663), not on chain ${chainId}.`,
    );
  }
  return chainId;
}

type ToolError = { content: Array<{ type: "text"; text: string }>; isError: true };

export function toolError(text: string): ToolError {
  return { content: [{ type: "text" as const, text: `Error: ${text}` }], isError: true };
}

function bodyField(body: unknown, key: string): unknown {
  return body !== null && typeof body === "object"
    ? (body as Record<string, unknown>)[key]
    : undefined;
}

const VELO_UPGRADE_REASONS: Record<string, string> = {
  not_open: "the upgrade has not opened yet",
  paused: "the upgrade contract is paused",
  budget_exhausted: "the upgrade has less new AERO left than this amount",
  recipient_not_deployed:
    "the wallet is a contract on Optimism with no code on Base, where the new AERO would be paid",
};

/**
 * Tool error for a failed Aero call.
 * 422: the backend's message (a bad choice, a chain without Aero, more than 10 accounts).
 * 404: not an Arcadia account. 409 with a reason: the VELO upgrade contract refused.
 */
export function aeroErrorResult(err: unknown): ToolError {
  if (!(err instanceof ArcadiaApiError)) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
  const message = String(bodyField(err.body, "message") ?? err.message);
  const reason = bodyField(err.body, "reason");

  if (err.status === 409 && typeof reason === "string") {
    const opensAt = bodyField(err.body, "opens_at");
    const when =
      typeof opensAt === "number" ? ` It opens at ${new Date(opensAt * 1000).toISOString()}.` : "";
    return toolError(
      `upgrade unavailable (${reason}): ${VELO_UPGRADE_REASONS[reason] ?? message}.${when} Backend message: ${message}`,
    );
  }
  if (err.status === 422) {
    return toolError(`rejected by the backend (422): ${message}`);
  }
  if (err.status === 404) {
    return toolError(`not found (404): ${message}`);
  }
  return toolError(err.message);
}

/** Tool error when the backend's simulation predicts a revert. */
export function simulationFailedResult(simulation: AeroSimulation): ToolError {
  return toolError(simulationFailedText(simulation));
}

function simulationFailedText(simulation: AeroSimulation): string {
  const simError = simulation.error ? `\nRevert reason: ${simulation.error}` : "";
  const simUrl = simulation.url ? `\nTenderly simulation: ${simulation.url}` : "";
  return `Transaction simulation FAILED, do NOT broadcast.${simError}${simUrl}`;
}

const isoTime = (seconds: number | null) =>
  seconds === null ? "an unknown time" : new Date(seconds * 1000).toISOString();

/** What the plan's status means for the agent, in one line. */
export function describePlanStatus(plan: AeroUpgradePlanResponse): string {
  switch (plan.status) {
    case "ready":
      return "The transaction moves every item whose status is ready; items that wait or are blocked stay where they are, see each item's reason.";
    case "choices_required": {
      const pick =
        "At least one position has status choose and stays where it is until the user picks one of its options whose disabled_reason is null (ask the user when unsure; tick_spacing, fee, apy, tvl_usd and range_widened differ per pool) and the tool is called again with the pick in choices.";
      return plan.calls.length > 0
        ? `${pick} The transaction moves only the items whose status is ready. Once it is signed, a call made before it confirms is built on the old state, so wait for the confirmation, then call again with choices.`
        : `${pick} There is no transaction yet.`;
    }
    case "waiting":
      return "Nothing can move yet. Each item's reason says what it waits for (pool_not_on_aero, staking_not_open, target_price_mismatch, account_unhealthy, ...). Do not retry in a loop; tell the user.";
    case "not_open":
      return `The AERO upgrade opens at ${isoTime(plan.opens_at)}; until then an upgrade that converts old AERO cannot be built. Tell the user when to come back.`;
    case "nothing_to_upgrade":
      return "Nothing on this account can move: it holds no Slipstream position and no old AERO, or every item is blocked (each blocked item's reason says what to do instead).";
  }
}

/** What the agent does after an upgrade transaction confirms. */
export function upgradeNextSteps(
  accountAddress: string,
  managers: AeroManagerToReconnect[],
  oldManagersStillNeeded: boolean,
  choicesPending: boolean,
): string[] {
  const steps = [
    `After the transaction confirms, call read.account.info for ${accountAddress}: every moved position now shows dex_protocol metadexcl_v1 (or staked_metadexcl_v1) with a new position id, and old AERO shows as the new AERO.`,
  ];
  if (choicesPending) {
    steps.push(
      `Only then call write.account.aero_upgrade again for ${accountAddress} with the user's picks in choices for the items whose status is choose.`,
    );
  }
  if (managers.length > 0) {
    const kinds = [...new Set(managers.map((m) => m.kind))].join(", ");
    steps.push(
      `Reconnect automations (${kinds}): call write.account.automations (mode save) with ${accountAddress}, the new Aero position_id and the intents read from read.asset_manager.current before the move. Omit protocol so the backend resolves metadexcl_v1 from the position.` +
        (oldManagersStillNeeded
          ? " A Slipstream position stays on this account, so keep its old managers: use write.account.automations_delta (enable) for the Aero position instead of a save that disables them."
          : " The save disables the old Slipstream managers in the same transaction."),
    );
  }
  return steps;
}

/** The plan as the tool returns it: the flashAction as an unsigned transaction, plus what the agent needs to explain it. */
export function formatUpgradePlan(plan: AeroUpgradePlanResponse, chainId: number) {
  // The planner composes one flashAction per account; a second call would be a
  // contract change this tool does not know how to order.
  if (plan.calls.length > 1) {
    throw new Error(
      `The backend returned ${plan.calls.length} calls for ${plan.account_address}; expected one flashAction.`,
    );
  }
  const call = plan.calls[0];
  const ready = plan.items.filter((i) => i.status === "ready").length;
  const simFailed = call !== undefined && isSimulationFailed(plan.simulation.status);
  return {
    description: `Upgrade ${plan.account_address} to Aero: ${ready} of ${plan.items.length} item${plan.items.length === 1 ? "" : "s"} ready`,
    account_address: plan.account_address,
    status: plan.status,
    status_note: describePlanStatus(plan),
    ...(call && !simFailed
      ? {
          transaction: {
            to: call.to,
            data: appendDataSuffix(call.data),
            value: call.value,
            chainId,
          },
          gas: call.gas ?? undefined,
        }
      : {}),
    ...(simFailed ? { error: simulationFailedText(plan.simulation) } : {}),
    ...(plan.simulation.url ? { tenderly_sim_url: plan.simulation.url } : {}),
    tenderly_sim_status: normalizeSimStatus(plan.simulation.status),
    opens_at: plan.opens_at,
    price_tolerance_bps: plan.price_tolerance_bps,
    items: plan.items,
    managers_to_reconnect: plan.managers_to_reconnect,
    old_managers_still_needed: plan.old_managers_still_needed,
    next_steps: call
      ? upgradeNextSteps(
          plan.account_address,
          plan.managers_to_reconnect,
          plan.old_managers_still_needed,
          plan.status === "choices_required",
        )
      : [],
  };
}
