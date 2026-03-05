#!/usr/bin/env node

try {
  const existing = { ...process.env };
  process.loadEnvFile();
  // MCP client env block takes precedence over .env
  Object.assign(process.env, existing);
} catch {
  // No .env file — expected in production / npx usage
}

import { createRequire } from "module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ArcadiaApiClient } from "./clients/api.js";
import { getChainConfigs } from "./config/chains.js";
import { registerAllTools } from "./tools/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const server = new McpServer({
  name: "arcadia-finance",
  version: pkg.version,
  description:
    "Arcadia Finance — manage concentrated liquidity positions with leverage, automated rebalancing, and yield optimization. Read protocol data and build unsigned transactions for LP management, borrowing, deposits, and more.",
});

const apiClient = new ArcadiaApiClient();
const chainConfigs = getChainConfigs();

registerAllTools(server, apiClient, chainConfigs);

const transport = new StdioServerTransport();
await server.connect(transport);
