import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../clients/api.js";
import type { ChainId, ChainConfig } from "../config/chains.js";
import { registerAccountTools } from "./read/accounts.js";
import { registerPoolTools } from "./read/pools.js";
import { registerAssetTools } from "./read/assets.js";
import { registerProtocolTools } from "./read/protocol.js";
import { registerPointsTools } from "./read/points.js";
import { registerGuideTools } from "./read/guides.js";
import { registerBalanceTools } from "./read/balances.js";
import { registerAllowanceTools } from "./read/allowances.js";
import { registerCreateAccountTool } from "./write/create-account.js";
import { registerDepositTool } from "./write/deposit.js";
import { registerWithdrawTool } from "./write/withdraw.js";
import { registerBorrowTool } from "./write/borrow.js";
import { registerRepayTool } from "./write/repay.js";
import { registerApproveTool } from "./write/approve.js";
import { registerSetAssetManagerTool } from "./write/set-asset-manager.js";
import { registerConfigureAssetManagerTool } from "./write/configure-asset-manager.js";
import { registerSignAndSendTool } from "./write/sign-and-send.js";
import { registerAddLiquidityTool } from "./advanced/add-liquidity.js";
import { registerRemoveLiquidityTool } from "./advanced/remove-liquidity.js";
import { registerSwapTool } from "./advanced/swap.js";
import { registerRepayWithCollateralTool } from "./advanced/repay-with-collateral.js";
import { registerPositionActionsTool } from "./advanced/position-actions.js";
import { registerClosePositionTool } from "./advanced/close-position.js";

export function registerAllTools(
  server: McpServer,
  api: ArcadiaApiClient,
  chains: Record<ChainId, ChainConfig>,
) {
  // Read tools
  registerAccountTools(server, api, chains);
  registerPoolTools(server, api);
  registerAssetTools(server, api);
  registerProtocolTools(server, api);
  registerPointsTools(server, api);
  registerGuideTools(server);
  registerBalanceTools(server, chains);
  registerAllowanceTools(server, chains);

  // Simple write tools
  registerCreateAccountTool(server, chains);
  registerDepositTool(server, chains);
  registerWithdrawTool(server, chains);
  registerBorrowTool(server, chains, api);
  registerRepayTool(server, chains);
  registerApproveTool(server, chains);
  registerSetAssetManagerTool(server, chains);
  registerConfigureAssetManagerTool(server, chains);
  registerSignAndSendTool(server, chains);

  // Advanced write tools (via backend API)
  registerAddLiquidityTool(server, api, chains);
  registerRemoveLiquidityTool(server, api);
  registerSwapTool(server, api);
  registerRepayWithCollateralTool(server, api);
  registerPositionActionsTool(server, api);
  registerClosePositionTool(server, api, chains);
}
