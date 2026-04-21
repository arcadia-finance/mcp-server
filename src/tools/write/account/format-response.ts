import { appendDataSuffix } from "../../../utils/attribution.js";

// Backend emits `tenderly_sim_status` as a JSON boolean (Python bool). We normalize
// to a 3-state string enum for clearer tool output. Historically the TS types
// claimed `string`, so legacy "true"/"false" strings are also tolerated here.
export function isSimulationFailed(status: unknown): boolean {
  return status === false || status === "false";
}

function normalizeSimStatus(status: unknown): "success" | "failure" | "unavailable" {
  if (status === true || status === "true") return "success";
  if (status === false || status === "false") return "failure";
  return "unavailable";
}

export function formatBatchedResponse(
  result: Record<string, unknown>,
  chainId: number,
  description?: string,
) {
  const to = (result.fx_call_to ?? "") as string;
  const data = appendDataSuffix((result.calldata ?? "") as string);

  const response: Record<string, unknown> = {};
  if (description) response.description = description;
  response.transaction = { to, data, value: "0", chainId };

  if (result.tenderly_sim_url != null) {
    response.tenderly_sim_url = result.tenderly_sim_url;
  }
  response.tenderly_sim_status = normalizeSimStatus(result.tenderly_sim_status);
  if (result.expected_value_change != null) {
    response.expected_value_change = String(result.expected_value_change);
  }
  if (result.before != null) {
    const b = result.before as Record<string, unknown>;
    response.before = {
      ...b,
      total_account_value: String(b.total_account_value),
      used_margin: String(b.used_margin),
    };
  }
  if (result.after != null) {
    const a = result.after as Record<string, unknown>;
    response.after = {
      ...a,
      total_account_value: String(a.total_account_value),
      used_margin: String(a.used_margin),
    };
  }

  return response;
}
