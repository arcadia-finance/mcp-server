import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWorkflowPrompts } from "./workflows.js";

export function registerAllPrompts(server: McpServer) {
  registerWorkflowPrompts(server);
}
