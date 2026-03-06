import { describe, it, expect, vi } from "vitest";
import { registerGuideResources } from "./guides.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface RegisteredResource {
  name: string;
  uri: string;
  config: { description: string; mimeType: string };
  callback: () => Promise<{ contents: Array<{ uri: string; text: string }> }>;
}

function setup() {
  const resources: RegisteredResource[] = [];
  const server = {
    registerResource: vi.fn(
      (
        name: string,
        uri: string,
        config: RegisteredResource["config"],
        callback: RegisteredResource["callback"],
      ) => {
        resources.push({ name, uri, config, callback });
      },
    ),
  };
  registerGuideResources(server as unknown as McpServer);
  return resources;
}

describe("guide resources", () => {
  it("registers 4 guide resources", () => {
    const resources = setup();
    expect(resources).toHaveLength(4);
  });

  it("each resource returns markdown content", async () => {
    const resources = setup();
    for (const resource of resources) {
      const result = await resource.callback();
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe(resource.uri);
      expect(result.contents[0].text.length).toBeGreaterThan(0);
    }
  });

  it("overview resource contains expected content", async () => {
    const resources = setup();
    const overview = resources.find((r) => r.name === "guide-overview")!;
    const result = await overview.callback();
    expect(result.contents[0].text).toContain("Arcadia Finance");
  });

  it("all resources use arcadia:// URI scheme", () => {
    const resources = setup();
    for (const resource of resources) {
      expect(resource.uri).toMatch(/^arcadia:\/\/guides\//);
    }
  });
});
