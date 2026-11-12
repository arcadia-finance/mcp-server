import { describe, it, expect, afterEach } from "vitest";
import { createMockServer, createMockChains } from "../../test-utils.js";
import { registerSendTool } from "./send.js";
import { viemChains } from "../../clients/chain.js";
import { getChainConfigs } from "../../config/chains.js";

describe("dev_send", () => {
  it("has a viem chain for every supported chain", () => {
    expect(Object.keys(viemChains).sort()).toEqual(Object.keys(getChainConfigs()).sort());
  });

  const originalEnv = process.env.PK;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.PK = originalEnv;
    } else {
      delete process.env.PK;
    }
  });

  it("is not registered when PK env var is unset", () => {
    delete process.env.PK;
    const mock = createMockServer();
    registerSendTool(mock.server, createMockChains());
    expect(mock.tools.find((t) => t.name === "dev_send")).toBeUndefined();
  });

  it("is registered when PK env var is set", () => {
    process.env.PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const mock = createMockServer();
    registerSendTool(mock.server, createMockChains());
    expect(mock.tools.find((t) => t.name === "dev_send")).toBeDefined();
  });

  it("returns error for unsupported chain ID", async () => {
    process.env.PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const mock = createMockServer();
    registerSendTool(mock.server, createMockChains());
    const handler = mock.getHandler("dev_send");

    const result = await handler({
      to: "0x1234567890abcdef1234567890abcdef12345678",
      data: "0xabcdef",
      value: "0",
      chain_id: 99999,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unsupported chain ID");
  });

  it("returns error for malformed calldata (odd-length hex)", async () => {
    process.env.PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const mock = createMockServer();
    registerSendTool(mock.server, createMockChains());
    const handler = mock.getHandler("dev_send");

    const result = await handler({
      to: "0x1234567890abcdef1234567890abcdef12345678",
      data: "0xabcde",
      value: "0",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid data");
  });

  it("returns error for non-decimal wei value string", async () => {
    process.env.PK = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const mock = createMockServer();
    registerSendTool(mock.server, createMockChains());
    const handler = mock.getHandler("dev_send");

    const result = await handler({
      to: "0x1234567890abcdef1234567890abcdef12345678",
      data: "0xabcd",
      value: "0x100",
      chain_id: 8453,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid value");
  });
});
