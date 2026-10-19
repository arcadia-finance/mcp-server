import { ArcadiaApiError } from "../clients/api.js";
import type { AeroManagerToReconnect } from "../types/api.js";

type ToolError = { content: Array<{ type: "text"; text: string }>; isError: true };

function toolError(text: string): ToolError {
  return { content: [{ type: "text" as const, text: `Error: ${text}` }], isError: true };
}

function bodyField(body: unknown, key: string): unknown {
  return body !== null && typeof body === "object"
    ? (body as Record<string, unknown>)[key]
    : undefined;
}

const UPGRADE_REASONS: Record<string, string> = {
  not_open: "the upgrade has not opened yet",
  paused: "the upgrade contract is paused",
  budget_exhausted: "the upgrade has less new AERO left than this amount",
  recipient_not_deployed:
    "the wallet is a contract on Optimism with no code on Base, where the new AERO would be paid",
};

/**
 * Tool error for a failed Aero migration or token-upgrade call.
 * 409 target choice: returns the alternatives to pick from. 409 upgrade: names the reason.
 * 422: passes the backend's code through. 503 Aero Migration Not Live: not live yet, not a server failure.
 */
export function aeroErrorResult(err: unknown): ToolError {
  if (!(err instanceof ArcadiaApiError)) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
  const message = String(bodyField(err.body, "message") ?? err.message);
  const candidates = bodyField(err.body, "candidates");
  const reason = bodyField(err.body, "reason");

  if (err.status === 409 && Array.isArray(candidates)) {
    return toolError(
      `target_choice_required: ${message}. Aero has no pool at the tick spacing of the position(s) below. ` +
        "Pick one alternative with selectable: true for each position (ask the user when unsure; tick_spacing, fee and range_widened differ per pool), " +
        "then call again with its pool_address as target_pool (one position) or in targets (whole account).\n" +
        `candidates: ${JSON.stringify(candidates, null, 2)}`,
    );
  }
  if (err.status === 409 && typeof reason === "string") {
    const opensAt = bodyField(err.body, "opens_at");
    const when =
      typeof opensAt === "number" ? ` It opens at ${new Date(opensAt * 1000).toISOString()}.` : "";
    return toolError(
      `upgrade unavailable (${reason}): ${UPGRADE_REASONS[reason] ?? message}.${when} Backend message: ${message}`,
    );
  }
  if (err.status === 422) {
    return toolError(`rejected by the backend (422): ${message}`);
  }
  if (err.status === 503 && bodyField(err.body, "name") === "Aero Migration Not Live") {
    return toolError(
      `Aero migration is not live yet: ${message}. This is not a server failure; the endpoints open once Arcadia's Aero contracts are live on this chain. Do not retry in a loop.`,
    );
  }
  return toolError(err.message);
}

/** Tool error when the backend's simulation predicts a revert. */
export function simulationFailedResult(res: {
  tenderly_sim_url?: unknown;
  tenderly_sim_error?: unknown;
}): ToolError {
  const simError = res.tenderly_sim_error ? `\nRevert reason: ${res.tenderly_sim_error}` : "";
  const simUrl = res.tenderly_sim_url ? `\nTenderly simulation: ${res.tenderly_sim_url}` : "";
  return toolError(`Transaction simulation FAILED, do NOT broadcast.${simError}${simUrl}`);
}

/** What the agent does after a migration transaction confirms. */
export function migrationNextSteps(
  accountAddress: string,
  managers: AeroManagerToReconnect[],
): string[] {
  const steps = [
    `After the transaction confirms, call read.account.info for ${accountAddress}: the migrated position now shows dex_protocol metadexcl_v1 (or staked_metadexcl_v1) with a new position id.`,
  ];
  if (managers.length > 0) {
    const kinds = [...new Set(managers.map((m) => m.kind))].join(", ");
    steps.push(
      `Reconnect automations (${kinds}): call write.account.automations (mode save) with ${accountAddress}, the new Aero position_id and the intents read from read.asset_manager.current before the move. Omit protocol so the backend resolves metadexcl_v1 from the position. The save disables the old Slipstream managers in the same transaction.`,
    );
  }
  return steps;
}
