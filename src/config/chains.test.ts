import { describe, it, expect } from "vitest";
import { resolveChainId } from "./chains.js";

describe("resolveChainId", () => {
  it.each([8453, 10, 130])("accepts numeric chain ID %d", (id) => {
    expect(resolveChainId(id)).toBe(id);
  });

  it("accepts string chain ID", () => {
    expect(resolveChainId("8453")).toBe(8453);
  });

  it("throws for unsupported numeric chain ID", () => {
    expect(() => resolveChainId(1)).toThrow("Unsupported chain ID: 1");
  });

  it("throws for NaN string", () => {
    expect(() => resolveChainId("abc")).toThrow("Unsupported chain ID: NaN");
  });
});
