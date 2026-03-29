import { appendDataSuffix } from "../../../utils/attribution.js";

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
  if (result.tenderly_sim_status != null) {
    response.tenderly_sim_status = result.tenderly_sim_status;
  } else {
    response.tenderly_sim_status = "unavailable";
  }
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
