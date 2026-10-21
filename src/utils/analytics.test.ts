import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/client";
import { McpServer, InMemoryTransport } from "@modelcontextprotocol/server";
import { createAnalytics, withAnalytics } from "./analytics.js";

async function setup() {
  const capture = vi.fn();
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const target = withAnalytics(
    server,
    server,
    { capture },
    { transport: "stdio", serverVersion: "1.2.3" },
  );
  target.registerTool(
    "read_thing_info",
    { description: "x", inputSchema: z.object({ id: z.string() }) },
    async ({ id }) => ({ content: [{ type: "text", text: id }], isError: id === "bad" }),
  );
  target.registerTool("read_thing_boom", { description: "x" }, async () => {
    throw new Error("kaboom");
  });
  const client = new Client({ name: "test-client", version: "9.9.9" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, capture };
}

describe("withAnalytics", () => {
  it("captures the tool name, args, and client", async () => {
    const { client, capture } = await setup();
    await client.callTool({ name: "read_thing_info", arguments: { id: "abc" } });
    expect(capture).toHaveBeenCalledOnce();
    const { event, properties } = capture.mock.calls[0][0];
    expect(event).toBe("mcp_tool_called");
    expect(properties).toMatchObject({
      tool: "read_thing_info",
      args: { id: "abc" },
      is_error: false,
      client_name: "test-client",
      client_version: "9.9.9",
      server_version: "1.2.3",
    });
  });

  it("flags isError results and thrown errors", async () => {
    const { client, capture } = await setup();
    await client.callTool({ name: "read_thing_info", arguments: { id: "bad" } });
    await client.callTool({ name: "read_thing_boom", arguments: {} });
    expect(capture.mock.calls[0][0].properties.is_error).toBe(true);
    expect(capture.mock.calls[1][0].properties).toMatchObject({
      is_error: true,
      error: "kaboom",
      args: undefined,
    });
  });
});

describe("createAnalytics", () => {
  it("reports only from the HTTP server with a key set", () => {
    vi.stubEnv("POSTHOG_KEY", "phc_test");
    expect(createAnalytics("stdio")).toBeNull();
    expect(createAnalytics("http")).not.toBeNull();
    vi.stubEnv("POSTHOG_KEY", " ");
    expect(createAnalytics("http")).toBeNull();
    vi.unstubAllEnvs();
  });
});
