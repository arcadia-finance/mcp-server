import { describe, it, expect } from "vitest";
import { normalizeAccountHistory } from "../account.js";

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
