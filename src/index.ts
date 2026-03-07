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
      "Arcadia Finance. Manage concentrated liquidity positions with leverage, automated rebalancing, and yield optimization on Base and Unichain.",
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

  const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
  const sessions = new Map<
    string,
    {
      server: McpServer;
      transport: InstanceType<typeof StreamableHTTPServerTransport>;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  function touchSession(id: string) {
    const entry = sessions.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      try {
        entry.transport.close();
      } catch {
        /* already closed */
      }
      sessions.delete(id);
    }, SESSION_TTL_MS);
  }

  async function createSession() {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, {
          server,
          transport,
          timer: setTimeout(() => {
            try {
              transport.close();
            } catch {
              /* already closed */
            }
            sessions.delete(sessionId);
          }, SESSION_TTL_MS),
        });
      },
    });
    await server.connect(transport);

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) {
        const entry = sessions.get(id);
        if (entry) clearTimeout(entry.timer);
        sessions.delete(id);
      }
    };

    return transport;
  }

  app.get("/health", (_req, res) => {
    res.send("ok");
  });

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      touchSession(sessionId!);
      await existing.transport.handleRequest(req, res);
    } else if (sessionId) {
      res.status(404).send("Session not found");
    } else {
      const transport = await createSession();
      try {
        await transport.handleRequest(req, res);
      } catch (err) {
        if (!transport.sessionId || !sessions.has(transport.sessionId)) {
          try {
            transport.close();
          } catch {
            /* ignore */
          }
        }
        throw err;
      }
    }
  });

  app.get("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    touchSession(sessionId);
    await sessions.get(sessionId)!.transport.handleRequest(req, res);
  });

  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    await sessions.get(sessionId)!.transport.handleRequest(req, res);
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
