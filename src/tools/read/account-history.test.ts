import { describe, it, expect, vi } from "vitest";
import { createMockServer, createMockChains } from "../../test-utils.js";
import { normalizeAccountHistory, registerAccountTools } from "./account.js";
import type { ArcadiaApiClient } from "../../clients/api.js";

/**
 * Reported as "read_account_history gives an error: {"history":[]}" for
 * 0x09B2d66174550e8C9b80DEf70C2B7AdA4EaF8928 on Base — an account that has
 * fourteen days of snapshots.
 *
 * `/accounts/historic_account_values` answers with an object keyed by unix
 * timestamp, not an array, and the tool coerced any non-array response to `[]`.
 * So a successful read of a populated account reported "no history", which is
 * exactly what an account with none reports.
 */
describe("normalizeAccountHistory", () => {
  // Shape and values as returned by the live endpoint for the reported account.
  const LIVE_RESPONSE = {
    values: {
      "1787011200": 1237.0896176060996,
      "1787097600": 1227.5769218255105,
      "1787184000": 1319.448959307199,
      "1787270400": 1410.3924738047194,
    },
  };

  it("keeps every snapshot from the timestamp-keyed response", () => {
    const history = normalizeAccountHistory(LIVE_RESPONSE);

    expect(history).toHaveLength(4);
    expect(history[0]).toEqual({ timestamp: 1787011200, net_value: 1237.0896176060996 });
  });

  it("returns snapshots oldest first", () => {
    // Deliberately out of order: object key order is not a guarantee to lean on.
    const history = normalizeAccountHistory({
      values: { "1787270400": 3, "1787011200": 1, "1787097600": 2 },
    });

    expect(history.map((h) => h.timestamp)).toEqual([1787011200, 1787097600, 1787270400]);
    expect(history.map((h) => h.net_value)).toEqual([1, 2, 3]);
  });

  it("numbers the timestamp rather than leaving it a string key", () => {
    const [first] = normalizeAccountHistory(LIVE_RESPONSE);
    expect(typeof first.timestamp).toBe("number");
  });

  it("reports a genuinely empty window as empty", () => {
    expect(normalizeAccountHistory({ values: {} })).toEqual([]);
    expect(normalizeAccountHistory(null)).toEqual([]);
    expect(normalizeAccountHistory(undefined)).toEqual([]);
  });

  it("still accepts an array, in case the endpoint changes shape", () => {
    const rows = [{ timestamp: 1, net_value: 2 }];
    expect(normalizeAccountHistory(rows)).toBe(rows);
  });

  it("throws on a shape it does not understand, rather than reporting no history", () => {
    // This is the whole point: a failed read must not be indistinguishable from
    // an account with no snapshots.
    expect(() => normalizeAccountHistory({ detail: "Not Found" })).toThrow(
      /Unexpected account-history response shape/,
    );
    expect(() => normalizeAccountHistory("nope")).toThrow(
      /Unexpected account-history response shape/,
    );
  });
});

/**
 * The tests above cover the extracted helper. These cover the WIRING, because
 * the bug was in the call site: reverting `read.account.history` to
 * `Array.isArray(raw) ? raw : []` left every helper test passing while
 * reproducing the exact reported symptom, `{"history":[]}`.
 *
 * So these drive the registered handler and assert on what the tool actually
 * emits.
 */
describe("read.account.history (the handler, not the helper)", () => {
  const ACCOUNT = "0x09B2d66174550e8C9b80DEf70C2B7AdA4EaF8928";
  const LIVE_RESPONSE = {
    values: {
      "1787011200": 1237.0896176060996,
      "1787097600": 1227.5769218255105,
      "1787184000": 1319.448959307199,
      "1787270400": 1410.3924738047194,
    },
    value_now: 1386.12,
    pnl_reference_points: {},
  };

  function handlerFor(raw: unknown) {
    const mock = createMockServer();
    const api = {
      getAccountHistory: vi.fn(async () => raw),
    } as unknown as ArcadiaApiClient;
    registerAccountTools(mock.server, api, createMockChains());
    return mock.getHandler("read.account.history");
  }

  it("emits every snapshot for a populated account", async () => {
    const result = await handlerFor(LIVE_RESPONSE)({
      chain_id: 8453,
      account_address: ACCOUNT,
      days: 14,
    });

    expect(result.isError).toBeFalsy();
    // The reported symptom, asserted where it appeared.
    expect(result.structuredContent.history).toHaveLength(4);
    expect(result.structuredContent.history[0]).toEqual({
      timestamp: 1787011200,
      net_value: 1237.0896176060996,
    });
    expect(JSON.stringify(result.structuredContent)).not.toBe('{"history":[]}');
  });

  it("still reports an empty series for an account that genuinely has none", async () => {
    const result = await handlerFor({ values: {} })({
      chain_id: 8453,
      account_address: ACCOUNT,
      days: 14,
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.history).toEqual([]);
  });

  it("surfaces an unrecognised shape as an error, not as an empty series", async () => {
    // The whole point of the change: a read that did not work must not look
    // like a read that found nothing.
    const result = await handlerFor({ unexpected: "shape" })({
      chain_id: 8453,
      account_address: ACCOUNT,
      days: 14,
    });

    expect(result.isError).toBe(true);
  });
});

describe("normalizeAccountHistory edge shapes", () => {
  it("treats a present-but-empty values key as an empty window", () => {
    // `{ values: [] }` and `{ values: null }` matched neither the object branch
    // nor the null branch, so the genuinely-empty window this function claims to
    // handle could throw.
    expect(normalizeAccountHistory({ values: [] })).toEqual([]);
    expect(normalizeAccountHistory({ values: null })).toEqual([]);
    expect(normalizeAccountHistory({ values: {} })).toEqual([]);
  });

  it("throws on a non-numeric timestamp key rather than emitting NaN", () => {
    // Number("oops") is NaN, which sorts unpredictably and serialises to null —
    // the quiet mangling this function exists to refuse.
    expect(() => normalizeAccountHistory({ values: { oops: 1 } })).toThrow(/timestamp key/);
  });

  it("still accepts an already-flat array response", () => {
    const flat = [{ timestamp: 1, net_value: 2 }];
    expect(normalizeAccountHistory(flat)).toBe(flat);
  });

  it("returns empty for an absent body but throws for a wrong-shaped one", () => {
    expect(normalizeAccountHistory(null)).toEqual([]);
    expect(normalizeAccountHistory(undefined)).toEqual([]);
    expect(() => normalizeAccountHistory({ totally: "different" })).toThrow(/response shape/);
  });
});
