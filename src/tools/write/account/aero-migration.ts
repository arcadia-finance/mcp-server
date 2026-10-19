import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../../clients/api.js";
import { appendDataSuffix } from "../../../utils/attribution.js";
import { formatBatchedResponse, isSimulationFailed } from "./format-response.js";
import { parseWeiDecimalString, validateAddress } from "../../../utils/validation.js";
import { aeroErrorResult, migrationNextSteps, simulationFailedResult } from "../../aero.js";
import { AeroMigrationOutput } from "../../output-schemas.js";

type Params = {
  action: "migrate" | "upgrade_aero" | "upgrade_velo";
  account_address?: string;
  owner_address?: string;
  asset_address?: string;
  position_id?: number;
  target_pool?: string;
  targets?: Array<{ asset_address: string; position_id: number; target_pool: string }>;
  price_tolerance_bps?: number;
  safe?: boolean;
  amount?: string;
  chain_id?: number;
};

function onlyFor(action: string, params: Params, names: Array<keyof Params>) {
  const stray = names.filter((n) => params[n] !== undefined);
  if (stray.length > 0) {
    throw new Error(`${stray.join(", ")} not used by action ${params.action} (only by ${action}).`);
  }
}

async function migrate(api: ArcadiaApiClient, p: Params) {
  onlyFor("upgrade_aero / upgrade_velo", p, ["amount"]);
  onlyFor("upgrade_velo", p, ["owner_address"]);
  const chainId = p.chain_id ?? 8453;
  const account = validateAddress(p.account_address ?? "", "account_address");
  const single = p.asset_address !== undefined || p.position_id !== undefined;
  if (single && (p.asset_address === undefined || p.position_id === undefined)) {
    throw new Error(
      "Pass asset_address and position_id together, or neither for the whole account.",
    );
  }
  if (single && p.targets !== undefined) {
    throw new Error("targets is for the whole account; for one position pass target_pool.");
  }
  if (!single && p.target_pool !== undefined) {
    throw new Error("target_pool is for one position; for the whole account pass targets.");
  }
  if (p.target_pool !== undefined) validateAddress(p.target_pool, "target_pool");
  for (const t of p.targets ?? []) {
    validateAddress(t.asset_address, "targets[].asset_address");
    validateAddress(t.target_pool, "targets[].target_pool");
  }

  const options = {
    chain_id: chainId,
    account_address: account,
    price_tolerance_bps: p.price_tolerance_bps,
    safe: p.safe || undefined,
  };
  const result = single
    ? await api.getMigrateMetadexclV1Calldata({
        ...options,
        asset_address: validateAddress(p.asset_address!, "asset_address"),
        position_id: p.position_id!,
        target_pool: p.target_pool,
      })
    : await api.getMigrateMetadexclV1AccountCalldata({ ...options, targets: p.targets });

  if (isSimulationFailed(result.tenderly_sim_status)) return simulationFailedResult(result);

  const moved = result.migration.positions.length;
  return {
    ...formatBatchedResponse(
      result as unknown as Record<string, unknown>,
      chainId,
      `Move ${moved} Slipstream position${moved === 1 ? "" : "s"} of ${account} to Aero`,
    ),
    gas_estimate: result.gas_estimate,
    price_tolerance_bps: result.price_tolerance_bps,
    migration: result.migration,
    managers_to_reconnect: result.managers_to_reconnect,
    next_steps: migrationNextSteps(account, result.managers_to_reconnect),
  };
}

async function upgradeAero(api: ArcadiaApiClient, p: Params) {
  onlyFor("migrate", p, [
    "asset_address",
    "position_id",
    "target_pool",
    "targets",
    "price_tolerance_bps",
    "safe",
  ]);
  onlyFor("upgrade_velo", p, ["owner_address"]);
  const chainId = p.chain_id ?? 8453;
  const account = validateAddress(p.account_address ?? "", "account_address");
  if (p.amount !== undefined) parseWeiDecimalString(p.amount, "amount");
  const result = await api.getUpgradeAeroCalldata({
    chain_id: chainId,
    account_address: account,
    amount: p.amount,
  });

  if (isSimulationFailed(result.tenderly_sim_status)) return simulationFailedResult(result);

  return {
    ...formatBatchedResponse(
      result as unknown as Record<string, unknown>,
      chainId,
      `Upgrade ${result.amount_in} old AERO in ${account} to the new AERO`,
    ),
    amount_in: result.amount_in,
    expected_amount_out: result.expected_amount_out,
    old_token: result.old_token,
    new_token: result.new_token,
  };
}

async function upgradeVelo(api: ArcadiaApiClient, p: Params) {
  onlyFor("migrate", p, [
    "asset_address",
    "position_id",
    "target_pool",
    "targets",
    "price_tolerance_bps",
    "safe",
  ]);
  onlyFor("migrate / upgrade_aero", p, ["account_address"]);
  const chainId = p.chain_id ?? 10;
  const owner = validateAddress(p.owner_address ?? "", "owner_address");
  if (p.amount !== undefined) parseWeiDecimalString(p.amount, "amount");
  const result = await api.getUpgradeVeloCalldata({
    chain_id: chainId,
    owner_address: owner,
    amount: p.amount,
  });
  if (BigInt(result.wallet_balance) < BigInt(result.amount_in)) {
    throw new Error(
      `${owner} holds ${result.wallet_balance} VELO on Optimism, less than the ${result.amount_in} requested; the deposit would revert.`,
    );
  }

  const last = result.calls.length - 1;
  return {
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
}

export function registerAeroMigrationTool(server: McpServer, api: ArcadiaApiClient) {
  server.registerTool(
    "write.account.aero_migration",
    {
      annotations: {
        title: "Build Aero Migration Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      outputSchema: AeroMigrationOutput,
      description:
        "Move to Aero (MetadexCL V1). Three actions, each returning unsigned transactions only:\n" +
        "- migrate (Base 8453, Optimism 10): one flashAction that moves Slipstream V1/V2/V3 positions (dex_protocol slipstream*, staked or not, see read.account.info) of account_address into the Aero CL pool with the same pair and tick spacing, at the same range. Pass asset_address + position_id for one position, or neither for every movable position of the account. Whole account: blocked positions are listed in migration.skipped with a code. One position: a blocked position returns a 422 whose message starts with the code. Report them as given, never decide eligibility yourself. When Aero has no pool at a position's tick spacing the tool returns target_choice_required with the alternatives: pick one with selectable: true (ask the user when unsure) and call again with its pool_address as target_pool, or in targets for the whole account. deprecated_reward_token_in_pair means a Base margin account holds a pair with the old AERO: that position cannot move. After it confirms, reconnect managers_to_reconnect with write.account.automations and verify with read.account.info (see next_steps).\n" +
        "- upgrade_aero (Base 8453 only): one flashAction that upgrades loose old AERO (0x940181a94A35A4569E4529A3CDfB74e38FD98631) held in account_address 1:1 into the new AERO (0x3f5bF3EdAc59d650D8fDf9657a71F2f904A3a4Ee). Does not change LP positions.\n" +
        "- upgrade_velo (chain_id 10 only): wallet transactions on Optimism from owner_address, in order: an approve when needed, then depositLiquid with the Hyperlane fee as value. 0.044 new AERO per VELO arrives at the same address on Base. VELO inside an account must be withdrawn first (write.account.withdraw).\n" +
        "Margin accounts hold Aero positions on Base only; on Optimism and Robinhood Aero positions are spot only, so moving an Optimism margin account's positions fails simulation. chain_id defaults per action: 8453 for migrate and upgrade_aero, 10 for upgrade_velo. A 'not live yet' error means Aero has not opened on that chain; 'upgrade unavailable' names the upgrade contract's reason. Calldata is time-sensitive: sign promptly, rebuild on a price revert. If tenderly_sim_status is failure, do NOT broadcast.",
      inputSchema: {
        action: z.enum(["migrate", "upgrade_aero", "upgrade_velo"]).describe("What to build"),
        account_address: z
          .string()
          .optional()
          .describe("migrate, upgrade_aero: Arcadia account address (the owner signs)"),
        owner_address: z
          .string()
          .optional()
          .describe("upgrade_velo: wallet holding the VELO on Optimism; receives the AERO on Base"),
        asset_address: z
          .string()
          .optional()
          .describe(
            "migrate, one position: position manager it is held at. Omit for the whole account.",
          ),
        position_id: z
          .number()
          .int()
          .optional()
          .describe("migrate, one position: NFT token ID. Omit for the whole account."),
        target_pool: z
          .string()
          .optional()
          .describe("migrate, one position: chosen Aero pool after target_choice_required"),
        targets: z
          .array(
            z.object({
              asset_address: z.string(),
              position_id: z.number().int(),
              target_pool: z.string(),
            }),
          )
          .optional()
          .describe(
            "migrate, whole account: one chosen Aero pool per position after target_choice_required",
          ),
        price_tolerance_bps: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe("migrate: price band the mint accepts, in bps. Omit for 150 (500 with safe)."),
        safe: z
          .boolean()
          .optional()
          .describe(
            "migrate: true when the owner is a multisig that signs later (500 bps default band)",
          ),
        amount: z
          .string()
          .optional()
          .describe(
            "upgrade_aero, upgrade_velo: raw units (18 decimals). Omit for the full balance.",
          ),
        chain_id: z
          .number()
          .optional()
          .describe(
            "Chain ID: 8453 (Base), 10 (Optimism) or 4663 (Robinhood). Defaults to 8453 for migrate and upgrade_aero, 10 for upgrade_velo.",
          ),
      },
    },
    async (params) => {
      try {
        const p = params as Params;
        const response =
          p.action === "migrate"
            ? await migrate(api, p)
            : p.action === "upgrade_aero"
              ? await upgradeAero(api, p)
              : await upgradeVelo(api, p);
        if ("isError" in response) return response;
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
