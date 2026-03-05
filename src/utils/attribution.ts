import { toHex, concatHex, stringToHex, size } from "viem";

// ERC-8021 fixed 16-byte suffix marker
const ERC_SUFFIX = "0x80218021802180218021802180218021" as const;

const BUILDER_CODE = "bc_u3g3444p";

// Compute ERC-8021 Schema 0 data suffix once at module load.
// Format: codes ∥ codesLength (1 byte) ∥ schemaId (1 byte) ∥ ercSuffix (16 bytes)
export const DATA_SUFFIX: `0x${string}` | "" = BUILDER_CODE
  ? (() => {
      const codesHex = stringToHex(BUILDER_CODE);
      const codesLength = toHex(size(codesHex), { size: 1 });
      const schemaId = toHex(0, { size: 1 });
      return concatHex([codesHex, codesLength, schemaId, ERC_SUFFIX]);
    })()
  : "";

export function appendDataSuffix(calldata: string): string {
  if (!DATA_SUFFIX) return calldata;
  return calldata + DATA_SUFFIX.slice(2);
}
