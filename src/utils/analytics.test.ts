import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { withAnalytics } from "./analytics.js";
import { wrapServerForHttp } from "./tool-naming.js";

async function setup(httpMode: boolean) {
  const capture = vi.fn();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const target = withAnalytics(
    httpMode ? wrapServerForHttp(server) : server,
    server,
    { capture },
    { transport: "stdio", serverVersion: "1.2.3" },
  );
  target.registerTool(
    "read.thing.info",
    { description: "x", inputSchema: { id: z.string() } },
    async ({ id }) => ({ content: [{ type: "text", text: id }], isError: id === "bad" }),
  );
  target.registerTool("read.thing.boom", { description: "x" }, async () => {
    throw new Error("kaboom");
  });
  const client = new Client({ name: "test-client", version: "9.9.9" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, capture };
}

describe("withAnalytics", () => {
  it("captures the tool name, args, and client", async () => {
    const { client, capture } = await setup(false);
    await client.callTool({ name: "read.thing.info", arguments: { id: "abc" } });
    expect(capture).toHaveBeenCalledOnce();
    const { event, properties } = capture.mock.calls[0][0];
    expect(event).toBe("mcp_tool_called");
    expect(properties).toMatchObject({
      tool: "read.thing.info",
      args: { id: "abc" },
      is_error: false,
      client_name: "test-client",
      client_version: "9.9.9",
      server_version: "1.2.3",
    });
  });

  it("keeps the dotted name in http mode, where the tool is registered underscored", async () => {
    const { client, capture } = await setup(true);
    await client.callTool({ name: "read_thing_info", arguments: { id: "abc" } });
    expect(capture.mock.calls[0][0].properties.tool).toBe("read.thing.info");
  });

  it("flags isError results and thrown errors", async () => {
    const { client, capture } = await setup(false);
    await client.callTool({ name: "read.thing.info", arguments: { id: "bad" } });
    await client.callTool({ name: "read.thing.boom", arguments: {} });
    expect(capture.mock.calls[0][0].properties.is_error).toBe(true);
    expect(capture.mock.calls[1][0].properties).toMatchObject({
      is_error: true,
      error: "kaboom",
      args: undefined,
    });
  });
});
