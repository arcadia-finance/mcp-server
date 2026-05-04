import { describe, it, expect, vi } from "vitest";
import {
  parseListenPort,
  parseRateLimitRpm,
  parseTrustProxyHopCount,
  applyTrustProxyFromEnv,
} from "./http-config.js";

describe("parseListenPort", () => {
  it("defaults to 3000", () => {
    expect(parseListenPort(undefined)).toBe(3000);
  });

  it("accepts valid ports", () => {
    expect(parseListenPort("8080")).toBe(8080);
    expect(parseListenPort("1")).toBe(1);
    expect(parseListenPort("65535")).toBe(65535);
  });

  it("rejects NaN and out-of-range values", () => {
    expect(() => parseListenPort("abc")).toThrow(/Invalid PORT/);
    expect(() => parseListenPort("0")).toThrow(/Invalid PORT/);
    expect(() => parseListenPort("65536")).toThrow(/Invalid PORT/);
  });
});

describe("parseRateLimitRpm", () => {
  it("defaults to 60", () => {
    expect(parseRateLimitRpm(undefined)).toBe(60);
  });

  it("parses positive integers", () => {
    expect(parseRateLimitRpm("120")).toBe(120);
  });

  it("falls back on invalid values", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseRateLimitRpm("-1")).toBe(60);
    expect(parseRateLimitRpm("oops")).toBe(60);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("caps absurd values", () => {
    expect(parseRateLimitRpm("9999999999")).toBe(1_000_000);
  });
});

describe("parseTrustProxyHopCount", () => {
  it("returns undefined when unset", () => {
    expect(parseTrustProxyHopCount(undefined)).toBeUndefined();
    expect(parseTrustProxyHopCount("")).toBeUndefined();
  });

  it("supports boolean-like tokens", () => {
    expect(parseTrustProxyHopCount("1")).toBe(1);
    expect(parseTrustProxyHopCount("true")).toBe(1);
    expect(parseTrustProxyHopCount("yes")).toBe(1);
  });

  it("supports hop counts", () => {
    expect(parseTrustProxyHopCount("3")).toBe(3);
  });

  it("warns and returns undefined for bad input", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseTrustProxyHopCount("0")).toBeUndefined();
    expect(parseTrustProxyHopCount("99")).toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("applyTrustProxyFromEnv", () => {
  it("calls app.set when hops are valid", () => {
    const app = { set: vi.fn() } as unknown as import("express").Express;
    applyTrustProxyFromEnv(app, "2");
    expect(app.set).toHaveBeenCalledWith("trust proxy", 2);
  });

  it("does nothing when unset", () => {
    const app = { set: vi.fn() } as unknown as import("express").Express;
    applyTrustProxyFromEnv(app, undefined);
    expect(app.set).not.toHaveBeenCalled();
  });
});
