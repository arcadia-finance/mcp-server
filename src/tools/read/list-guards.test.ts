import { describe, it, expect, vi } from "vitest";
import { createMockServer } from "../../test-utils.js";
import { registerPoolTools } from "./pools.js";
import { registerStrategyTools } from "./strategy.js";
import { registerAssetTools } from "./assets.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

/**
 * These cover the WIRING of the shape guards, not the guards themselves.
 *
 * shapes.test.ts proves `expectArray` discriminates, but reverting the call
 * site in pools.ts to `Array.isArray(result) ? result : []` left the whole
 * suite green — a well-tested helper with untested wiring, which is the same
 * shape as the account-history bug one level up. The QA harness's
 * `nonEmpty` can't catch it either: these endpoints return arrays today, so
 * both versions produce identical output and the guard never fires.
 *
 * Each test hands the tool an OBJECT where it expects a list — the exact shape
 * that silently became `[]` before — and asserts the tool reports an error
 * rather than "nothing here".
 */

function handler(
  register: (server: McpServer, api: ArcadiaApiClient) => void,
  name: string,
  api: object,
) {
  const mock = createMockServer();
  register(mock.server, api as ArcadiaApiClient);
  return mock.getHandler(name);
}

const OBJECT_BODY = { values: { "1787011200": 1237.08 } };

describe("read.pool.list wiring", () => {
  it("reports an error for an object body instead of an empty pool list", async () => {
    const h = handler(registerPoolTools, "read.pool.list", {
      getPools: vi.fn(async () => OBJECT_BODY),
    });
    const result = await h({ chain_id: 8453 });
    expect(result.isError).toBe(true);
  });

  it("still passes a real array through", async () => {
    const pools = [{ address: "0x1", name: "wETH" }];
    const h = handler(registerPoolTools, "read.pool.list", {
      getPools: vi.fn(async () => pools),
    });
    const result = await h({ chain_id: 8453 });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.pools).toHaveLength(1);
  });
});

describe("read.strategy.list wiring (featured_only)", () => {
  it("reports an error for an object body instead of an empty strategy list", async () => {
    const h = handler(registerStrategyTools, "read.strategy.list", {
      getFeatured: vi.fn(async () => OBJECT_BODY),
    });
    const result = await h({ featured_only: true, chain_id: 8453, limit: 10, offset: 0 });
    expect(result.isError).toBe(true);
  });
});

describe("read.asset.list wiring", () => {
  it("accepts the wrapped shape the endpoint actually returns", async () => {
    // /assets answers { assets: [...] }, so this must NOT be treated as junk.
    const h = handler(registerAssetTools, "read.asset.list", {
      getAssets: vi.fn(async () => ({
        assets: [{ address: "0x1", name: "USDG", decimals: 6, standard: "ERC20" }],
      })),
    });
    const result = await h({ chain_id: 4663 });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.assets).toHaveLength(1);
  });

  it("reports an error for a body that is neither an array nor a known wrapper", async () => {
    const h = handler(registerAssetTools, "read.asset.list", {
      getAssets: vi.fn(async () => ({ unexpected: "shape" })),
    });
    const result = await h({ chain_id: 4663 });
    expect(result.isError).toBe(true);
  });

  it("treats a present-but-empty wrapper as an empty answer", async () => {
    const h = handler(registerAssetTools, "read.asset.list", {
      getAssets: vi.fn(async () => ({ assets: [] })),
    });
    const result = await h({ chain_id: 4663 });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.assets).toEqual([]);
  });
});
