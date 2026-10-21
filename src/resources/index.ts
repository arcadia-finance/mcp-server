import type { McpServer } from "@modelcontextprotocol/server";
import { registerGuideResources } from "./guides.js";

export function registerAllResources(server: McpServer) {
  registerGuideResources(server);
}
