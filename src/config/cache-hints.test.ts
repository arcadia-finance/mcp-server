import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { CACHE_HINTS } from "./cache-hints.js";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
};

async function call(method: string) {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "test", version: "0.0.0" }, { cacheHints: CACHE_HINTS });
    server.registerTool("ping", { description: "ping" }, async () => ({
      content: [{ type: "text" as const, text: "pong" }],
    }));
    return server;
  });
  const response = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": method,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { _meta: META } }),
    }),
  );
  const text = await response.text();
  const json = text.startsWith("{") ? text : text.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse((json ?? "").replace(/^data: /, "")).result;
}

describe("CACHE_HINTS", () => {
  it("covers every cacheable method with a positive ttl", () => {
    expect(Object.keys(CACHE_HINTS).sort()).toEqual([
      "prompts/list",
      "resources/list",
      "resources/read",
      "resources/templates/list",
      "server/discover",
      "tools/list",
    ]);
    for (const hint of Object.values(CACHE_HINTS)) {
      expect(hint.ttlMs).toBeGreaterThan(0);
    }
  });

  it.each(["tools/list", "server/discover"])("is emitted on the wire for %s", async (method) => {
    const result = await call(method);
    expect(result.ttlMs).toBe(CACHE_HINTS[method as keyof typeof CACHE_HINTS]?.ttlMs);
    expect(result.cacheScope).toBe("public");
    expect(result.resultType).toBe("complete");
  });
});
