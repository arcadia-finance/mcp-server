#!/usr/bin/env node

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
    "Arcadia Finance protocol — read account data, lending pools, strategies, and build unsigned transactions for deposits, borrows, LP management, and more.",
});

const apiClient = new ArcadiaApiClient();
const chainConfigs = getChainConfigs();

registerAllTools(server, apiClient, chainConfigs);

const transport = new StdioServerTransport();
await server.connect(transport);
