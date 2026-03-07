import { describe, it, expect } from "vitest";
import { createMockServer } from "../../test-utils.js";
import { registerGuideTools } from "./guides.js";

function setup() {
  const mock = createMockServer();
  registerGuideTools(mock.server);
  return mock.getHandler("read.guides");
}

describe("read.guides", () => {
  it("returns overview guide content", async () => {
    const handler = setup();
    const result = await handler({ topic: "overview" });
    expect(result.content[0].text).toContain("Arcadia Finance");
    expect(result.content[0].text).toContain("MCP Tools");
    expect(result.isError).not.toBe(true);
  });

  it("returns automation guide content", async () => {
    const handler = setup();
    const result = await handler({ topic: "automation" });
    expect(result.content[0].text).toContain("Rebalancer");
    expect(result.content[0].text).toContain("Compounder");
  });

  it("returns strategies guide content", async () => {
    const handler = setup();
    const result = await handler({ topic: "strategies" });
    expect(result.content[0].text).toContain("Delta Neutral");
    expect(result.content[0].text).toContain("write.account.add_liquidity");
  });

  it("returns selection guide content", async () => {
    const handler = setup();
    const result = await handler({ topic: "selection" });
    expect(result.content[0].text).toContain("Range Width");
    expect(result.content[0].text).toContain("Leverage Sizing");
  });
});
