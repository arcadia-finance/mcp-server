import type { PublicClient } from "viem";
import { accountAbi } from "../../abis/index.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

// Reads owner, creditor, numeraire on-chain via multicall.
// Used as fallback when getAccountOverview fails.
export async function readAccountMetadata(
  client: PublicClient,
  accountAddress: `0x${string}`,
): Promise<{ owner: `0x${string}`; creditor: `0x${string}`; numeraire: `0x${string}` }> {
  const results = await client.multicall({
    contracts: [
      { address: accountAddress, abi: accountAbi, functionName: "owner" },
      { address: accountAddress, abi: accountAbi, functionName: "creditor" },
      { address: accountAddress, abi: accountAbi, functionName: "numeraire" },
    ],
    allowFailure: true,
  });

  return {
    owner: results[0].status === "success" ? (results[0].result as `0x${string}`) : ZERO_ADDRESS,
    creditor: results[1].status === "success" ? (results[1].result as `0x${string}`) : ZERO_ADDRESS,
    numeraire:
      results[2].status === "success" ? (results[2].result as `0x${string}`) : ZERO_ADDRESS,
  };
}
