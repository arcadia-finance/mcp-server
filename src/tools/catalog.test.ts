import { describe, it, expect, beforeAll } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { ArcadiaApiClient } from "../clients/api.js";
import { getChainConfigs } from "../config/chains.js";
import { registerAllTools } from "./index.js";
import { registerAllPrompts } from "../prompts/index.js";
import { registerAllResources } from "../resources/index.js";

// What clients see over the protocol: no network, only tools/list, prompts/list and resources/list.
const MODEL_API_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const CLAUDE_CODE_PREFIX = "mcp__arcadia-finance__";

type Listed = Awaited<ReturnType<Client["listTools"]>>["tools"];

describe("published catalog", () => {
  let tools: Listed;
  let client: Client;

  beforeAll(async () => {
    const server = new McpServer({ name: "arcadia-finance", version: "0.0.0" });
    registerAllTools(server, new ArcadiaApiClient(), getChainConfigs());
    registerAllPrompts(server);
    registerAllResources(server);
    const [serverT, clientT] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "catalog-test", version: "0.0.0" });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);
    tools = (await client.listTools()).tools;
  });

  it("lists 38 tools, 4 prompts and 4 guide resources", async () => {
    expect(tools).toHaveLength(38);
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toEqual([
      "analyze-account",
      "find-yield-strategy",
      "setup-automation",
      "migrate-to-aero",
    ]);
    expect((await client.listResources()).resources).toHaveLength(4);
  });

  it("names every tool in snake_case that model APIs accept, with the client prefix", () => {
    for (const { name } of tools) {
      expect(name).toMatch(/^(read|write|dev)_[a-z_]+$/);
      expect(`${CLAUDE_CODE_PREFIX}${name}`).toMatch(MODEL_API_NAME);
    }
  });

  it("publishes every input and output schema as a JSON object schema", () => {
    for (const tool of tools) {
      expect(tool.inputSchema.type, `${tool.name} inputSchema`).toBe("object");
      if (tool.outputSchema) {
        expect(tool.outputSchema.type, `${tool.name} outputSchema`).toBe("object");
      }
    }
  });

  it("keeps the parameter descriptions", () => {
    const upgrade = tools.find((t) => t.name === "write_account_aero_upgrade")!;
    const props = upgrade.inputSchema.properties as Record<string, { description?: string }>;
    expect(props.chain_id.description).toBe(
      "Chain ID: 8453 (Base), 10 (Optimism) or 4663 (Robinhood, nothing to upgrade)",
    );
  });
});
