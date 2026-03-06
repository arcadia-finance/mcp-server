import { describe, it, expect, vi } from "vitest";
import { registerWorkflowPrompts } from "./workflows.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface RegisteredPrompt {
  name: string;
  config: { description: string };
  callback: (args: Record<string, string>) => Promise<{
    messages: Array<{ role: string; content: { type: string; text: string } }>;
  }>;
}

function setup() {
  const prompts: RegisteredPrompt[] = [];
  const server = {
    registerPrompt: vi.fn(
      (
        name: string,
        config: RegisteredPrompt["config"],
        callback: RegisteredPrompt["callback"],
      ) => {
        prompts.push({ name, config, callback });
      },
    ),
  };
  registerWorkflowPrompts(server as unknown as McpServer);
  return prompts;
}

describe("workflow prompts", () => {
  it("registers 3 prompts", () => {
    const prompts = setup();
    expect(prompts).toHaveLength(3);
  });

  it("analyze-account returns messages with account address", async () => {
    const prompts = setup();
    const prompt = prompts.find((p) => p.name === "analyze-account")!;
    const result = await prompt.callback({ account_address: "0xabc", chain_id: "8453" });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content.text).toContain("0xabc");
  });

  it("find-yield-strategy uses default chain when not specified", async () => {
    const prompts = setup();
    const prompt = prompts.find((p) => p.name === "find-yield-strategy")!;
    const result = await prompt.callback({});
    expect(result.messages[0].content.text).toContain("8453");
  });

  it("setup-automation mentions build_configure_asset_manager_tx", async () => {
    const prompts = setup();
    const prompt = prompts.find((p) => p.name === "setup-automation")!;
    const result = await prompt.callback({ account_address: "0xdef" });
    expect(result.messages[0].content.text).toContain("build_configure_asset_manager_tx");
  });

  it("find-yield-strategy includes deposit_token when specified", async () => {
    const prompts = setup();
    const prompt = prompts.find((p) => p.name === "find-yield-strategy")!;
    const result = await prompt.callback({ deposit_token: "USDC" });
    expect(result.messages[0].content.text).toContain("USDC");
  });

  it("analyze-account uses default chain_id when not specified", async () => {
    const prompts = setup();
    const prompt = prompts.find((p) => p.name === "analyze-account")!;
    const result = await prompt.callback({ account_address: "0xabc" });
    expect(result.messages[0].content.text).toContain("8453");
  });
});
