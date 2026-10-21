import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import {
  AERO_NPM_BASE,
  AERO_NPM_OP,
  AERO_NPM_ROBINHOOD,
  ARC_STAKED_METADEX_CL_AM,
  ARC_WRAPPED_STAKED_METADEX_CL,
  backendProtocolToDexProtocol,
  positionManagerToDexProtocol,
} from "./addresses.js";

describe("Aero CL (MetadexCL V1) position managers", () => {
  it("maps the Aero NPM to metadexcl_v1 on Base, Optimism and Robinhood, case-insensitively", () => {
    expect(positionManagerToDexProtocol(8453, AERO_NPM_BASE)).toBe("metadexcl_v1");
    expect(positionManagerToDexProtocol(10, AERO_NPM_OP)).toBe("metadexcl_v1");
    expect(positionManagerToDexProtocol(4663, AERO_NPM_ROBINHOOD)).toBe("metadexcl_v1");
  });

  it.each([8453, 10, 4663] as const)(
    "maps the staked module and the wrapper to staked_metadexcl_v1 on chain %i",
    (chainId) => {
      expect(positionManagerToDexProtocol(chainId, ARC_STAKED_METADEX_CL_AM)).toBe(
        "staked_metadexcl_v1",
      );
      expect(positionManagerToDexProtocol(chainId, ARC_WRAPPED_STAKED_METADEX_CL)).toBe(
        "staked_metadexcl_v1",
      );
    },
  );

  it("does not map the Aero NPM on Unichain", () => {
    expect(positionManagerToDexProtocol(130, AERO_NPM_BASE)).toBeNull();
  });

  it("maps the backend metadexcl_v1 protocol", () => {
    expect(backendProtocolToDexProtocol("metadexcl_v1")).toBe("metadexcl_v1");
  });
});

describe("addresses.ts source", () => {
  const source = readFileSync(fileURLToPath(new URL("./addresses.ts", import.meta.url)), "utf-8");

  it("has no placeholder address", () => {
    expect(source).not.toContain('"0x..."');
  });

  it("declares every AERO_* and ARC_* constant in EIP-55", () => {
    const declared = [...source.matchAll(/const (?:AERO|ARC)_\w+ = "(0x[0-9a-fA-F]{40})"/g)];
    expect(declared.length).toBe(5);
    for (const [, value] of declared) {
      expect(value).toBe(getAddress(value));
    }
  });
});
