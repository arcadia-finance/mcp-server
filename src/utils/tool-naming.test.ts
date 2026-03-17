import { describe, it, expect } from "vitest";
import { convertToolNames } from "./tool-naming.js";

describe("convertToolNames", () => {
  it("converts a read tool name", () => {
    expect(convertToolNames("read.account.info")).toBe("read_account_info");
  });

  it("converts a write tool name", () => {
    expect(convertToolNames("write.wallet.approve")).toBe("write_wallet_approve");
  });

  it("converts dev tool name", () => {
    expect(convertToolNames("dev.send")).toBe("dev_send");
  });

  it("converts tool names with existing underscores", () => {
    expect(convertToolNames("write.asset_manager.rebalancer")).toBe(
      "write_asset_manager_rebalancer",
    );
    expect(convertToolNames("write.account.add_liquidity")).toBe("write_account_add_liquidity");
  });

  it("converts multiple tool names in one string", () => {
    const input = "Call read.wallet.allowances first, then write.wallet.approve if needed.";
    const expected = "Call read_wallet_allowances first, then write_wallet_approve if needed.";
    expect(convertToolNames(input)).toBe(expected);
  });

  it("preserves URLs", () => {
    expect(convertToolNames("Visit https://arcadia.finance for more info.")).toBe(
      "Visit https://arcadia.finance for more info.",
    );
  });

  it("preserves decimal numbers", () => {
    expect(convertToolNames("APY is 0.05 (5%)")).toBe("APY is 0.05 (5%)");
  });

  it("preserves normal sentences", () => {
    expect(convertToolNames("This is a sentence. And another one.")).toBe(
      "This is a sentence. And another one.",
    );
  });

  it("does not match partial prefixes", () => {
    expect(convertToolNames("readonly.something")).toBe("readonly.something");
    expect(convertToolNames("rewrite.something")).toBe("rewrite.something");
  });

  it("converts tool names in JSON strings", () => {
    const json = JSON.stringify({ tool: "write.asset_manager.rebalancer" });
    expect(convertToolNames(json)).toBe(JSON.stringify({ tool: "write_asset_manager_rebalancer" }));
  });

  it("returns empty string unchanged", () => {
    expect(convertToolNames("")).toBe("");
  });
});
