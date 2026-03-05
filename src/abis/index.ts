import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const load = (name: string) => JSON.parse(readFileSync(join(__dirname, `${name}.json`), "utf-8"));

export const accountAbi = load("account");
export const accountV4Abi = load("account_v4");

export function getAccountAbi(version: number) {
  return version >= 4 ? accountV4Abi : accountAbi;
}
export const factoryAbi = load("factory");
export const poolAbi = load("pool");
export const erc20Abi = load("erc20");
export const registryAbi = load("mainreg");
export const stateViewerAbi = load("state_viewer");
export const trancheAbi = load("tranche");
export const chainlinkAbi = load("chainlink");
export const gaugeHelperAbi = load("gauge_helper");
export const nftmanagerAbi = load("nftmanager");
export const nftmanagerV4Abi = load("nftmanager_v4");
export const slipstreamNftmanagerAbi = load("slipstream_nftmanager");
export const stakedAeroAmAbi = load("staked_aero_am");
export const stakedSlipstreamAmAbi = load("staked_slipstream_am");
export const wrappedAeroAmAbi = load("wrapped_aero_am");
export const wrappedStakedSlipstreamAmAbi = load("wrapped_staked_slipstream_am");
