import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockServer, createMockChains } from "../../test-utils.js";
import { registerSignAndSendTool } from "./sign-and-send.js";

describe("sign_and_send_tx", () => {
  const originalEnv = process.env.PK;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PK = originalEnv;
    } else {
      delete process.env.PK;
    }
  });

  it("does not register when PK env var is unset", () => {
    delete process.env.PK;
    const mock = createMockServer();
    registerSignAndSendTool(mock.server, createMockChains());
    expect(mock.tools.find((t) => t.name === "sign_and_send_tx")).toBeUndefined();
  });

  it("registers when PK env var is set", () => {
    process.env.PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const mock = createMockServer();
    registerSignAndSendTool(mock.server, createMockChains());
    expect(mock.tools.find((t) => t.name === "sign_and_send_tx")).toBeDefined();
  });

  it("returns error for unsupported chain ID", async () => {
    process.env.PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const mock = createMockServer();
    registerSignAndSendTool(mock.server, createMockChains());
    const handler = mock.getHandler("sign_and_send_tx");

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
