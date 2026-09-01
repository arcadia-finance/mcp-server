/**
 * Response-shape guards shared by the read tools.
 *
 * `Array.isArray(raw) ? raw : []` is the pattern that made a populated
 * account-history response report `{"history":[]}`: the endpoint answered with
 * an object, the guard did not recognise it, and the tool said "nothing here".
 * A read that did not work has to look different from a read that found
 * nothing, so an unrecognised shape throws and the handler surfaces it as
 * `isError` rather than as an empty list.
 */

/** An array response, or `[]` for an absent one. Throws on anything else. */
export function expectArray<T = Record<string, unknown>>(raw: unknown, what: string): T[] {
  if (Array.isArray(raw)) return raw as T[];
  // An absent body is a legitimately empty answer; a present body of the wrong
  // shape is not.
  if (raw === null || raw === undefined) return [];
  throw new Error(`Unexpected ${what} response shape: ${JSON.stringify(raw).slice(0, 200)}`);
}

/**
 * An array response, or one wrapped in the first matching `keys` field.
 *
 * `/assets` answers `{ assets: [...] }`, so a bare `expectArray` would reject a
 * valid body. The part worth keeping is the refusal: `?? []` at the end of a
 * wrapper chain turns an unrecognised body into "no assets", which is the same
 * silent-empty failure as the account-history bug.
 */
export function expectArrayOrWrapped<T = Record<string, unknown>>(
  raw: unknown,
  what: string,
  ...keys: string[]
): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw === null || raw === undefined) return [];

  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of keys) {
      if (!(key in obj)) continue;
      const value = obj[key];
      if (Array.isArray(value)) return value as T[];
      // The wrapper is there and carries nothing: an answer, not a bad shape.
      if (value === null || value === undefined) return [];
    }
  }

  throw new Error(`Unexpected ${what} response shape: ${JSON.stringify(raw).slice(0, 200)}`);
}
