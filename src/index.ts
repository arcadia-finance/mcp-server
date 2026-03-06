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
import type { Request, Response } from "express";

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
  registerAllResources(server);
  registerAllPrompts(server);
  return server;
}

const transportMode = process.env.TRANSPORT ?? "stdio";

if (transportMode === "http") {
  const { StreamableHTTPServerTransport } =
    await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const express = (await import("express")).default;

  const app = express();
  const port = parseInt(process.env.PORT ?? "3000", 10);

  const sessions = new Map<string, { server: McpServer; transport: InstanceType<typeof StreamableHTTPServerTransport> }>();

  async function getOrCreateSession(sessionId: string | undefined) {
    if (sessionId && sessions.has(sessionId)) return sessions.get(sessionId)!;

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await server.connect(transport);

    const id = transport.sessionId!;
    sessions.set(id, { server, transport });

    transport.onclose = () => {
      sessions.delete(id);
    };

    return { server, transport };
  }

  app.get("/health", (_req, res) => {
    res.send("ok");
  });

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const { transport } = await getOrCreateSession(sessionId);
    await transport.handleRequest(req, res);
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const { transport } = sessions.get(sessionId)!;
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
