import { appendDataSuffix } from "../../utils/attribution.js";

export function formatAdvancedResponse(result: Record<string, unknown>, chainId: number) {
  const to = (result.fx_call_to ?? "") as string;
  const data = appendDataSuffix((result.calldata ?? "") as string);

  const response: Record<string, unknown> = {
    transaction: { to, data, value: "0", chainId },
  };

  if (result.tenderly_sim_url != null) {
    response.tenderly_sim_url = result.tenderly_sim_url;
  }
  if (result.tenderly_sim_status != null) {
    response.tenderly_sim_status = result.tenderly_sim_status;
  } else {
    response.tenderly_sim_status = "unavailable";
  }
  if (result.expected_value_change != null) {
    response.expected_value_change = result.expected_value_change;
  }
  if (result.before != null) response.before = result.before;
  if (result.after != null) response.after = result.after;

  return response;
}
