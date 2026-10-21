import type { McpServer } from "@modelcontextprotocol/server";
import { registerWorkflowPrompts } from "./workflows.js";

export function registerAllPrompts(server: McpServer) {
  registerWorkflowPrompts(server);
}
