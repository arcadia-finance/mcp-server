import { describe, it, expect } from "vitest";
import { expectArray } from "./shapes.js";

/**
 * `Array.isArray(raw) ? raw : []` is what made a populated account-history
 * response report `{"history":[]}`. The same pattern was still in the pools and
 * strategy readers — latent only because both endpoints happen to return
 * arrays today, exactly as the miscased Optimism address was latent.
 */
describe("expectArray", () => {
  it("passes an array through unchanged", () => {
    const rows = [{ a: 1 }];
    expect(expectArray(rows, "pools")).toBe(rows);
  });

  it("treats an absent body as an empty answer", () => {
    expect(expectArray(null, "pools")).toEqual([]);
    expect(expectArray(undefined, "pools")).toEqual([]);
  });

  it("throws on an object body instead of reporting nothing", () => {
    // The account-history shape: a real answer the old guard silently discarded.
    expect(() => expectArray({ values: { "1": 2 } }, "pools")).toThrow(
      /Unexpected pools response shape/,
    );
  });

  it("names what it was reading, so the error says where it came from", () => {
    expect(() => expectArray({ x: 1 }, "featured strategies")).toThrow(/featured strategies/);
  });

  it("truncates a large body rather than dumping it into the message", () => {
    const huge = { blob: "x".repeat(5000) };
    let message = "";
    try {
      expectArray(huge, "pools");
    } catch (e) {
      message = e instanceof Error ? e.message : "";
    }
    expect(message.length).toBeLessThan(300);
  });
});
