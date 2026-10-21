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
import { McpServer } from "@modelcontextprotocol/server";
import { ArcadiaApiClient } from "./clients/api.js";
import { getChainConfigs } from "./config/chains.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";
import { createAnalytics, withAnalytics } from "./utils/analytics.js";
import { applyTrustProxyFromEnv, parseListenPort, parseRateLimitRpm } from "./utils/http-config.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const apiClient = new ArcadiaApiClient();
const chainConfigs = getChainConfigs();
const transportMode = process.env.TRANSPORT ?? "stdio";
const analytics = createAnalytics(transportMode);

function buildServer() {
  const server = new McpServer({
    name: "arcadia-finance",
    version: pkg.version,
    description:
      "Arcadia Finance. Manage concentrated liquidity positions on Uniswap and Aero with automated rebalancing, compounding, yield optimization, and leverage. Base, Optimism, Unichain and Robinhood.",
  });
  const target = analytics
    ? withAnalytics(server, server, analytics, {
        transport: transportMode,
        serverVersion: pkg.version,
      })
    : server;
  registerAllTools(target, apiClient, chainConfigs);
  registerAllResources(target);
  registerAllPrompts(target);
  return server;
}

if (transportMode === "http") {
  const express = (await import("express")).default;
  const { createMcpHandler } = await import("@modelcontextprotocol/server");
  const { toNodeHandler } = await import("@modelcontextprotocol/node");

  const app = express();
  applyTrustProxyFromEnv(app, process.env.TRUST_PROXY);
  const port = parseListenPort(process.env.PORT);

  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://mcp.arcadia.finance")
    .split(",")
    .map((o) => o.trim());

  function validateOrigin(
    req: import("express").Request,
    res: import("express").Response,
  ): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // non-browser clients (curl, SDK) don't send Origin
    if (!ALLOWED_ORIGINS.includes(origin)) {
      res.status(403).send("Forbidden: invalid origin");
      return false;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Mcp-Method, Mcp-Name, Mcp-Protocol-Version",
    );
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return true;
  }

  app.options("/mcp", (req, res) => {
    if (!validateOrigin(req, res)) return;
    res.status(204).end();
  });

  const { default: rateLimit } = await import("express-rate-limit");
  app.use(
    "/mcp",
    rateLimit({
      windowMs: 60_000,
      max: parseRateLimitRpm(process.env.RATE_LIMIT_RPM),
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get("/health", (_req, res) => {
    res.send("ok");
  });

  for (const file of ["llms.txt", "llms-full.txt"]) {
    app.get(`/${file}`, async (_req, res) => {
      const { readFile } = await import("fs/promises");
      const { fileURLToPath } = await import("url");
      const { dirname, join } = await import("path");
      const dir = dirname(fileURLToPath(import.meta.url));
      res.type("text/plain").send(await readFile(join(dir, "..", file), "utf-8"));
    });
  }

  // Stateless per the 2026-07-28 spec: a fresh server per request, 2025-era clients served without sessions.
  const mcp = toNodeHandler(
    createMcpHandler(buildServer, { onerror: (err) => console.error("MCP handler error:", err) }),
  );
  app.all("/mcp", express.json(), (req, res) => {
    if (!validateOrigin(req, res)) return;
    void mcp(req, res, req.body);
  });

  app.listen(port, () => {
    console.log(`Arcadia MCP server listening on port ${port}`);
  });
} else {
  const { serveStdio } = await import("@modelcontextprotocol/server/stdio");
  serveStdio(buildServer);
}
