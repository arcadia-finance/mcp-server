import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGuideResources } from "./guides.js";

export function registerAllResources(server: McpServer) {
  registerGuideResources(server);
}
