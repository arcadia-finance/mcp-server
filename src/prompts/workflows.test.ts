import { describe, it, expect, vi } from "vitest";
import { registerWorkflowPrompts } from "./workflows.js";
import type { McpServer } from "@modelcontextprotocol/server";

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
  it("registers 4 prompts", () => {
    const prompts = setup();
    expect(prompts).toHaveLength(4);
  });

  it("migrate-to-aero walks the move, reconnect and verification in order", async () => {
    const prompts = setup();
    const prompt = prompts.find((p) => p.name === "migrate-to-aero")!;
    const text = (await prompt.callback({ account_address: "0xabc" })).messages[0].content.text;
    expect(text).toContain("0xabc");
    expect(text).toContain("8453");
    const order = [
      "read_account_aero_upgrade",
      "read_account_info",
      "read_asset_manager_current",
      "write_account_aero_upgrade",
      "write_account_automations",
    ].map((name) => text.indexOf(name));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("choices_required");
    expect(text).toContain("write_wallet_upgrade_velo");
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

  it("setup-automation points at the intent-based automation tools", async () => {
    const prompts = setup();
    const prompt = prompts.find((p) => p.name === "setup-automation")!;
    const result = await prompt.callback({ account_address: "0xdef" });
    const text = result.messages[0].content.text;
    expect(text).toContain("write_account_automations");
    expect(text).toContain("read_asset_manager_current");
    expect(text).toContain("compound_fees");
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

  it("find-yield-strategy requires explicit user confirmation before accept_price_risk", async () => {
    const prompts = setup();
    const prompt = prompts.find((p) => p.name === "find-yield-strategy")!;
    const text = (await prompt.callback({})).messages[0].content.text;
    expect(text).toContain("write_account_add_liquidity");
    expect(text).toContain("price_checks");
    expect(text).toContain("accept_price_risk");
    expect(text).toContain("explicitly confirms");
  });
});
