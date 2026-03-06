import { describe, it, expect } from "vitest";
import { isValidAddress, validateAddress, validateChainId } from "./validation.js";

describe("isValidAddress", () => {
  it("returns true for valid lowercase address", () => {
    expect(isValidAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(true);
  });

  it("returns true for valid uppercase address", () => {
    expect(isValidAddress("0x1234567890ABCDEF1234567890ABCDEF12345678")).toBe(true);
  });

  it("returns true for mixed-case checksummed address", () => {
    expect(isValidAddress("0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2")).toBe(true);
  });

  it("returns false for missing 0x prefix", () => {
    expect(isValidAddress("1234567890abcdef1234567890abcdef12345678")).toBe(false);
  });

  it("returns false for too-short hex string", () => {
    expect(isValidAddress("0x1234567890abcdef")).toBe(false);
  });

  it("returns false for too-long hex string", () => {
    expect(isValidAddress("0x1234567890abcdef1234567890abcdef1234567890")).toBe(false);
  });

  it("returns false for non-hex characters", () => {
    expect(isValidAddress("0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidAddress("")).toBe(false);
  });
});

describe("validateAddress", () => {
  it("returns the address when valid", () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    expect(validateAddress(addr)).toBe(addr);
  });

  it("throws with default label when invalid", () => {
    expect(() => validateAddress("bad")).toThrow('Invalid address: "bad"');
  });

  it("throws with custom label when invalid", () => {
    expect(() => validateAddress("bad", "pool")).toThrow('Invalid pool: "bad"');
  });
});

describe("validateChainId", () => {
  it.each([8453, 130])("accepts supported chain ID %d", (id) => {
    expect(validateChainId(id)).toBe(id);
  });

  it("throws for unsupported chain ID", () => {
    expect(() => validateChainId(1)).toThrow("Unsupported chain_id: 1");
  });

  it("error message lists supported chains", () => {
    expect(() => validateChainId(999)).toThrow("Base (8453)");
  });
});
