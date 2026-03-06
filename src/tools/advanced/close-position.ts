import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";
import type { ChainId, ChainConfig } from "../../config/chains.js";
import { getPublicClient } from "../../clients/chain.js";
import { readAccountMetadata } from "./account-metadata.js";
import { formatAdvancedResponse } from "./format-response.js";
import { validateAddress, validateChainId } from "../../utils/validation.js";

export function registerClosePositionTool(
  server: McpServer,
  api: ArcadiaApiClient,
  chains: Record<ChainId, ChainConfig>,
) {
  server.registerTool(
    "build_close_position_tx",
    {
      annotations: {
        title: "Build Close Position Transaction",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description: `Atomic flash-action that closes an Arcadia account position in ONE transaction. Combines up to 3 steps atomically: [burn LP position] + [swap all tokens to a single target asset] + [repay debt]. Tokens remain in the account after closing — use build_withdraw_tx to send them to your wallet.

ALWAYS try this tool first when closing/exiting a position. Only fall back to individual tools (build_remove_liquidity_tx, build_swap_tx, build_repay_with_collateral_tx, build_withdraw_tx) if this tool fails.

Supports two modes:
- close_lp_only=true: Burns LP and leaves underlying tokens in the account. Use as step 1 if the full close fails, then call again with close_lp_only=false to swap+repay the remaining tokens.
- close_lp_only=false (default): Full atomic close — burns LP, swaps everything to receive_assets, repays debt. Remaining tokens stay in the account. Follow up with build_withdraw_tx to send to wallet. Supports multiple receive assets with custom distribution.

The returned calldata is time-sensitive — sign and broadcast within 30 seconds. If the transaction reverts due to price movement, rebuild and sign again immediately (retry at least once before giving up). Response includes tenderly_sim_url and tenderly_sim_status for pre-broadcast validation.`,
      inputSchema: {
        account_address: z.string().describe("Arcadia account address"),
        assets: z
          .array(
            z.object({
              asset_address: z.string().describe("Token or position manager address"),
              asset_id: z.number().describe("NFT token ID (0 for ERC20 tokens)"),
              amount: z.string().describe("Amount to sell (use '1' for NFT positions)"),
              decimals: z.number().describe("Token decimals (use 1 for NFT positions)"),
            }),
          )
          .describe(
            "Assets to close/sell from the account. For LP positions: asset_address = position manager, asset_id = NFT ID, amount = '1', decimals = 1. For ERC20 tokens: asset_id = 0, amount = full balance, decimals = token decimals. Get these from get_account_info.",
          ),
        receive_assets: z
          .array(
            z.object({
              asset_address: z.string().describe("Target token address (e.g. USDC, WETH)"),
              decimals: z.number().describe("Token decimals of the target asset"),
              distribution: z
                .number()
                .optional()
                .describe(
                  "Fraction of proceeds (0-1). Defaults to equal split across all receive assets.",
                ),
            }),
          )
          .optional()
          .describe(
            "Target assets to receive after closing. For a single target, pass one entry. Required when close_lp_only=false. Omit for close_lp_only=true.",
          ),
        close_lp_only: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "true = only burn LP positions, leave underlying tokens in account. false = full close (burn + swap + repay).",
          ),
        slippage: z.number().optional().default(100).describe("Basis points, 100 = 1%"),
        chain_id: z.number().default(8453).describe("Chain ID: 8453 (Base) or 130 (Unichain)"),
      },
    },
    async ({ account_address, assets, receive_assets, close_lp_only, slippage, chain_id }) => {
      try {
        const validChainId = validateChainId(chain_id);
        const validAccount = validateAddress(account_address, "account_address");
        const actionType = close_lp_only ? "account.closing-lp" : "account.closing-position";

        if (!close_lp_only && (!receive_assets || receive_assets.length === 0)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: receive_assets is required for full close (close_lp_only=false). Specify at least one target asset to convert everything to (e.g. USDC or WETH).",
              },
            ],
            isError: true,
          };
        }

        // Look up account metadata (fall back to on-chain reads)
        const overviewRaw = (await api
          .getAccountOverview(chain_id, account_address)
          .catch(() => null)) as Record<string, unknown> | null;
        let owner: string;
        let creditor: string;
        let numeraire: string;
        let version: number;

        if (overviewRaw) {
          owner = (overviewRaw.owner ?? "") as string;
          if (!owner) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: Could not determine account owner from overview.",
                },
              ],
              isError: true,
            };
          }
          creditor =
            (overviewRaw.creditor as string) ?? "0x0000000000000000000000000000000000000000";

          const { accounts } = await api.getAccounts(chain_id, owner);
          const accountStub = (
            accounts as Array<{
              account_address: string;
              creation_version: number;
              numeraire: string;
            }>
          ).find((a) => a.account_address.toLowerCase() === account_address.toLowerCase());
          numeraire = accountStub?.numeraire ?? "";
          version = accountStub?.creation_version ?? 3;
        } else {
          const client = getPublicClient(validChainId, chains);
          const metadata = await readAccountMetadata(client, validAccount);
          owner = metadata.owner;
          creditor = metadata.creditor;
          numeraire = metadata.numeraire;

          if (!owner || owner === "0x0000000000000000000000000000000000000000") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Error: Could not determine account owner. The account may not exist on this chain.",
                },
              ],
              isError: true,
            };
          }

          const { accounts } = await api.getAccounts(chain_id, owner);
          const accountStub = (
            accounts as Array<{
              account_address: string;
              creation_version: number;
              numeraire: string;
            }>
          ).find((a) => a.account_address.toLowerCase() === account_address.toLowerCase());
          version = accountStub?.creation_version ?? 3;
          if (accountStub?.numeraire) numeraire = accountStub.numeraire;
        }

        // Resolve numeraire decimals
        const rawAssets = await api.getAssets(chain_id);
        const assetObj = rawAssets as Record<string, unknown>;
        const assetList = (
          Array.isArray(rawAssets) ? rawAssets : (assetObj.assets ?? assetObj.data ?? [])
        ) as Record<string, unknown>[];
        let numeraireDecimals = 18;
        for (const a of assetList) {
          const addr = ((a.address ?? a.asset_address ?? "") as string).toLowerCase();
          if (addr === numeraire.toLowerCase() && a.decimals != null) {
            numeraireDecimals = Number(a.decimals);
            break;
          }
        }

        // Build buy array from receive_assets
        const defaultDist = receive_assets ? 1 / receive_assets.length : 1;
        const buy = close_lp_only
          ? []
          : receive_assets!.map((r) => ({
              asset_address: r.asset_address,
              distribution: r.distribution ?? defaultDist,
              decimals: r.decimals,
              strategy_id: 0,
            }));

        const body = {
          buy,
          sell: assets.map((a) => ({
            asset_address: a.asset_address,
            amount: a.amount,
            decimals: a.decimals,
            asset_id: a.asset_id,
          })),
          deposits: {
            addresses: [] as string[],
            ids: [] as number[],
            amounts: [] as string[],
            decimals: [] as number[],
          },
          withdraws: {
            addresses: [] as string[],
            ids: [] as number[],
            amounts: [] as string[],
            decimals: [] as number[],
          },
          wallet_address: owner,
          account_address,
          numeraire,
          numeraire_decimals: numeraireDecimals,
          debt: {
            take: false,
            leverage: 0,
            repay: -1,
            creditor,
          },
          chain_id,
          version,
          action_type: actionType,
          slippage: slippage ?? 100,
        };

        const result = await api.getBundleCalldata(body);
        const res = result as unknown as Record<string, unknown>;

        if (res.tenderly_sim_status === "false") {
          const simUrl = res.tenderly_sim_url
            ? `\nTenderly simulation: ${res.tenderly_sim_url}`
            : "";
          const simError = res.tenderly_sim_error
            ? `\nRevert reason: ${res.tenderly_sim_error}`
            : "";
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Transaction simulation FAILED — do NOT broadcast.${simError}${simUrl}\n\nIf this was a full close, try close_lp_only=true first to burn the LP, then call again with close_lp_only=false to swap and repay the remaining tokens.`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(formatAdvancedResponse(res, chain_id), null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
