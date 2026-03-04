import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../clients/api.js";
import type { ChainId, ChainConfig } from "../config/chains.js";
import { registerAccountTools } from "./read/accounts.js";
import { registerPoolTools } from "./read/pools.js";
import { registerAssetTools } from "./read/assets.js";
import { registerProtocolTools } from "./read/protocol.js";
import { registerPointsTools } from "./read/points.js";
import { registerCreateAccountTool } from "./write/create-account.js";
import { registerDepositTool } from "./write/deposit.js";
import { registerWithdrawTool } from "./write/withdraw.js";
import { registerBorrowTool } from "./write/borrow.js";
import { registerRepayTool } from "./write/repay.js";
import { registerApproveTool } from "./write/approve.js";
import { registerSetAssetManagerTool } from "./write/set-asset-manager.js";
import { registerConfigureAssetManagerTool } from "./write/configure-asset-manager.js";
import { registerAddLiquidityTool } from "./advanced/add-liquidity.js";
import { registerRemoveLiquidityTool } from "./advanced/remove-liquidity.js";
import { registerSwapTool } from "./advanced/swap.js";
import { registerRepayWithCollateralTool } from "./advanced/repay-with-collateral.js";
import { registerPositionActionsTool } from "./advanced/position-actions.js";

export function registerAllTools(
  server: McpServer,
  api: ArcadiaApiClient,
  chains: Record<ChainId, ChainConfig>,
) {
  // Read tools
  registerAccountTools(server, api);
  registerPoolTools(server, api);
  registerAssetTools(server, api);
  registerProtocolTools(server, api);
  registerPointsTools(server, api);

  // Simple write tools
  registerCreateAccountTool(server, chains);
  registerDepositTool(server, chains);
  registerWithdrawTool(server, chains);
  registerBorrowTool(server, chains);
  registerRepayTool(server, chains);
  registerApproveTool(server, chains);
  registerSetAssetManagerTool(server, chains);
  registerConfigureAssetManagerTool(server, chains);

  // Advanced write tools (via backend API)
  registerAddLiquidityTool(server, api);
  registerRemoveLiquidityTool(server, api);
  registerSwapTool(server, api);
  registerRepayWithCollateralTool(server, api);
  registerPositionActionsTool(server, api);
}
