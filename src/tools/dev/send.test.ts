import { describe, it, expect, afterEach } from "vitest";
import { createMockServer, createMockChains } from "../../test-utils.js";
import { registerSendTool } from "./send.js";

describe("dev.send", () => {
  const originalEnv = process.env.PK;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PK = originalEnv;
    } else {
      delete process.env.PK;
    }
  });

  it("always registers even when PK env var is unset", () => {
    delete process.env.PK;
    const mock = createMockServer();
    registerSendTool(mock.server, createMockChains());
    expect(mock.tools.find((t) => t.name === "dev.send")).toBeDefined();
  });

  it("returns error when PK env var is unset", async () => {
    delete process.env.PK;
    const mock = createMockServer();
    registerSendTool(mock.server, createMockChains());
    const handler = mock.getHandler("dev.send");

    const result = await handler({
      to: "0x1234567890abcdef1234567890abcdef12345678",
      data: "0xabcdef",
      value: "0",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("PK not set");
    expect(result.content[0].text).toContain(".env file");
  });

  it("returns error for unsupported chain ID", async () => {
    process.env.PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const mock = createMockServer();
    registerSendTool(mock.server, createMockChains());
    const handler = mock.getHandler("dev.send");

    const result = await handler({
      to: "0x1234567890abcdef1234567890abcdef12345678",
      data: "0xabcdef",
      value: "0",
      chain_id: 99999,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unsupported chain ID");
  });
});
