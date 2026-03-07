import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../clients/api.js";
import type { ChainId, ChainConfig } from "../config/chains.js";
import { registerAccountTools } from "./read/account.js";
import { registerPoolTools } from "./read/pools.js";
import { registerAssetTools } from "./read/assets.js";
import { registerStrategyTools } from "./read/strategy.js";
import { registerPointsTools } from "./read/points.js";
import { registerGuideTools } from "./read/guides.js";
import { registerWalletTools } from "./read/wallet.js";
import { registerCreateTool } from "./write/account/create.js";
import { registerDepositTool } from "./write/account/deposit.js";
import { registerWithdrawTool } from "./write/account/withdraw.js";
import { registerBorrowTool } from "./write/account/borrow.js";
import { registerRepayTool } from "./write/account/repay.js";
import { registerApproveTool } from "./write/wallet/approve.js";
import { registerSetTool } from "./write/asset-manager/set.js";
import { registerConfigureTool } from "./write/asset-manager/configure.js";
import { registerSendTool } from "./dev/send.js";
import { registerAddLiquidityTool } from "./write/account/add-liquidity.js";
import { registerRemoveLiquidityTool } from "./write/account/remove-liquidity.js";
import { registerSwapTool } from "./write/account/swap.js";
import { registerDeleverageTool } from "./write/account/deleverage.js";
import { registerStakeTool } from "./write/account/stake.js";
import { registerCloseTool } from "./write/account/close.js";

export function registerAllTools(
  server: McpServer,
  api: ArcadiaApiClient,
  chains: Record<ChainId, ChainConfig>,
) {
  // Read tools
  registerAccountTools(server, api, chains);
  registerPoolTools(server, api);
  registerAssetTools(server, api);
  registerStrategyTools(server, api);
  registerPointsTools(server, api);
  registerGuideTools(server);
  registerWalletTools(server, chains);

  // Write tools — account
  registerCreateTool(server, chains);
  registerDepositTool(server, chains);
  registerWithdrawTool(server, chains);
  registerBorrowTool(server, chains, api);
  registerRepayTool(server, chains);
  registerAddLiquidityTool(server, api, chains);
  registerRemoveLiquidityTool(server, api);
  registerSwapTool(server, api);
  registerDeleverageTool(server, api);
  registerStakeTool(server, api);
  registerCloseTool(server, api, chains);

  // Write tools — wallet
  registerApproveTool(server, chains);

  // Write tools — asset manager
  registerSetTool(server, chains);
  registerConfigureTool(server, chains);

  // Dev tools
  registerSendTool(server, chains);
}
