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
import { ArcadiaApiClient } from "./clients/api.js";
import { getChainConfigs } from "./config/chains.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const apiClient = new ArcadiaApiClient();
const chainConfigs = getChainConfigs();

function createServer() {
  const server = new McpServer({
    name: "arcadia-finance",
    version: pkg.version,
    description:
      "Arcadia Finance. Manage concentrated liquidity positions with leverage, automated rebalancing, and yield optimization on Base, Optimism, and Unichain.",
  });
  registerAllTools(server, apiClient, chainConfigs);
  return server;
}

const transportMode = process.env.TRANSPORT ?? "stdio";

if (transportMode === "http") {
  const { StreamableHTTPServerTransport } =
    await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const express = (await import("express")).default;

  const app = express();
  const port = parseInt(process.env.PORT ?? "3000", 10);

  app.get("/health", (_req, res) => {
    res.send("ok");
  });

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  app.listen(port, () => {
    console.log(`Arcadia MCP server listening on port ${port}`);
  });
} else {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
