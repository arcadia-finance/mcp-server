import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { CHAIN_ID_DESCRIPTION } from "../../../config/chains.js";
import { appendDataSuffix } from "../../../utils/attribution.js";
import { validateAddress, validateChainId } from "../../../utils/validation.js";
import {
  aeroErrorResult,
  simulationFailedText,
  simulationReverted,
  simulationStatus,
  toolError,
} from "../../aero.js";
import { BatchedTransactionOutput } from "../../output-schemas.js";
import {
  acknowledgementFor,
  describePriceCheck,
  isCovered,
  PriceCheckAcknowledgement,
  tokenSymbolMap,
} from "./price-checks.js";

export function registerAdjustRangeTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write_account_adjust_range",
    {
      annotations: {
        title: "Build Adjust Range Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: BatchedTransactionOutput,
      description:
        "Move one LP position in an Arcadia account to a new tick range in one flashAction: the position is burned, its own tokens (fees included, less the protocol share) are swapped to the new range's ratio and it is minted again, staked again when it was. Nothing else in the account moves and the debt is unchanged, so other collateral keeps backing the account. Use this to re-range a position the account already holds; use write_account_add_liquidity to open a position or add capital. " +
        "Supports Uniswap V3, Uniswap V4, Slipstream and Aero positions in spot and margin accounts. position_manager and position_id are the position's asset address and NFT id from read_account_info. tick_lower and tick_upper must be multiples of the pool's tick spacing and differ from the current range. A staked or wrapped Slipstream position whose gauge is killed is refused: move it to Aero (write_account_aero_upgrade) or close it. " +
        "The returned calldata is time-sensitive: sign and broadcast promptly; on a price revert, build again. After a transaction confirms, pass its block as min_block on the next call. If tenderly_sim_status is failure the tool returns an error and no transaction; unavailable means Tenderly did not answer: call once more before signing. Only the account owner can sign it. " +
        "If the pool's price is off market or one of its tokens has no price, the tool returns the price warnings, an accept_price_checks list and NO transaction. Show the warnings to the user and call again with that accept_price_checks list only after the user explicitly confirms they accept them. If a later call returns new warnings, even on a rebuild, show them and get a new confirmation before passing their list.",
      inputSchema: z.object({
        account_address: z.string().describe("Arcadia account address"),
        position_manager: z
          .string()
          .describe("Asset address of the position in the account (from read_account_info)"),
        position_id: z.number().int().min(0).describe("NFT id of the position"),
        tick_lower: z.number().int().describe("Lower tick of the new range"),
        tick_upper: z.number().int().describe("Upper tick of the new range"),
        slippage: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("Swap slippage in bps. Omit for the backend default (50)."),
        min_block: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe(
            "Block of the transaction you just confirmed, so the build reads state at or after it",
          ),
        accept_price_checks: z
          .array(PriceCheckAcknowledgement)
          .optional()
          .describe(
            "The accept_price_checks list returned with the price warnings of a previous call, passed unchanged and only after the user has explicitly confirmed those warnings. Never set it on the first call.",
          ),
        chain_id: z.number().default(8453).describe(CHAIN_ID_DESCRIPTION),
      }),
    },
    async ({
      account_address,
      position_manager,
      position_id,
      tick_lower,
      tick_upper,
      slippage,
      min_block,
      accept_price_checks,
      chain_id,
    }) => {
      try {
        const chainId = validateChainId(chain_id);
        const result = await api.getAdjustRange({
          chain_id: chainId,
          account_address: validateAddress(account_address, "account_address"),
          position_manager: validateAddress(position_manager, "position_manager"),
          position_id,
          tick_lower,
          tick_upper,
          slippage,
          min_block,
        });
        const flagged = result.price_checks.filter((c) => c.status !== "ok");
        const symbols = tokenSymbolMap(chainId);
        const warningText =
          flagged.length > 0
            ? `\nPrice warnings:\n${flagged.map((c) => describePriceCheck(c, symbols)).join("\n")}`
            : "";
        if (simulationReverted(result.simulation)) {
          return toolError(`${simulationFailedText(result.simulation)}${warningText}`);
        }
        const acknowledgements = flagged.map(acknowledgementFor);
        const uncovered = acknowledgements.filter((a) => !isCovered(a, accept_price_checks ?? []));
        if (uncovered.length > 0) {
          const changed = accept_price_checks
            ? " The price checks changed since the user confirmed them."
            : "";
          return toolError(
            `Price warnings, no transaction returned.${changed} Show these warnings to the user. Call again with accept_price_checks set to the list below only after the user explicitly confirms they accept them.${warningText}\naccept_price_checks: ${JSON.stringify(acknowledgements)}`,
          );
        }
        if (result.calls.length !== 1) {
          throw new Error(
            `The backend returned ${result.calls.length} calls for ${result.account_address}; expected one flashAction.`,
          );
        }
        const call = result.calls[0];
        const status = simulationStatus(result.simulation);
        const response = {
          description: `Adjust range of position ${position_id} in ${result.account_address} to [${result.range.tick_lower}, ${result.range.tick_upper})`,
          transaction: {
            to: call.to,
            data: appendDataSuffix(call.data),
            value: call.value,
            chainId,
          },
          gas: call.gas,
          ...(result.simulation.url ? { tenderly_sim_url: result.simulation.url } : {}),
          tenderly_sim_status: status,
          ...(status === "unavailable"
            ? {
                simulation_note:
                  "Tenderly did not answer, so this transaction is unsimulated. Call the tool once more before signing; the backend simulates again.",
              }
            : {}),
          asset_changes: result.simulation.asset_changes ?? [],
          owner: result.owner,
          position: result.position,
          range: result.range,
          swap: result.swap,
          value_moved_usd: result.value_moved_usd,
          price_impact_usd: result.price_impact_usd,
          slippage_bps: result.slippage_bps,
          price_tolerance_bps: result.price_tolerance_bps,
          price_checks: result.price_checks,
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
