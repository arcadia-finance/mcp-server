import { describe, it, expect } from "vitest";
import { normalizeObjectSchema } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import * as schemas from "./output-schemas.js";

// Regression guard for the _zod crash.
// MCP SDK's `validateToolOutput` pipes every outputSchema through
// `normalizeObjectSchema`. For a bare `z.record(...)` (no `.shape`),
// normalization returns `undefined` and the SDK then calls
// `safeParseAsync(undefined, ...)`, which throws
// `Cannot read properties of undefined (reading '_zod')`.
//
// Every exported outputSchema must normalize to something truthy (a ZodObject).
describe("output-schemas: SDK normalization", () => {
  const entries = Object.entries(schemas).filter(
    ([, v]) => v && typeof v === "object" && ("_def" in v || "_zod" in v),
  );

  it("exports at least one schema (sanity)", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("%s normalizes to an object schema", (_name, schema) => {
    const normalized = normalizeObjectSchema(schema as Parameters<typeof normalizeObjectSchema>[0]);
    expect(normalized).toBeDefined();
  });
});
