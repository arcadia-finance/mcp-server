/**
 * Shared test fixtures for integration tests.
 * Discovers real accounts via the Arcadia accounts leaderboard instead of hardcoding addresses.
 */
import { ArcadiaApiClient } from "../clients/api.js";

const CHAIN_ID = 8453;
const MAX_OVERVIEW_CALLS = 5;

interface LPPosition {
  address: string;
  id: number;
  name: string;
  isStaked: boolean;
}

export interface TestAccount {
  accountAddress: string;
  owner: string;
  hasDebt: boolean;
  creditor: string;
  lpPositions: LPPosition[];
}

let cachedAccounts: TestAccount[] | null = null;

interface LeaderboardEntry {
  account_address: string;
  owner_address: string;
  open_debt: number;
}

/**
 * Discover test accounts from the accounts leaderboard.
 * Fetches overviews for the top accounts to find LP positions.
 * Results are cached for the test session.
 */
export async function discoverTestAccounts(api?: ArcadiaApiClient): Promise<TestAccount[]> {
  if (cachedAccounts) return cachedAccounts;

  const client = api ?? new ArcadiaApiClient();
  const leaderboard = (await client.getLeaderboard(CHAIN_ID)) as unknown as LeaderboardEntry[];

  if (!leaderboard?.length) {
    throw new Error("Accounts leaderboard returned no entries — cannot discover test accounts");
  }

  const accounts: TestAccount[] = [];

  for (const entry of leaderboard.slice(0, MAX_OVERVIEW_CALLS)) {
    try {
      const overview = (await client.getAccountOverview(CHAIN_ID, entry.account_address)) as {
        owner: string;
        debt: number;
        creditor: string;
        assets: Array<{
          name: string;
          address: string;
          id: number;
          standard: string;
        }>;
      };

      const lps: LPPosition[] = (overview.assets ?? [])
        .filter((a) => a.standard === "ERC721" && a.id > 0)
        .map((a) => ({
          address: a.address,
          id: a.id,
          name: a.name,
          isStaked: a.name.toLowerCase().includes("staked"),
        }));

      if (lps.length > 0) {
        accounts.push({
          accountAddress: entry.account_address,
          owner: overview.owner,
          hasDebt: entry.open_debt > 0,
          creditor: overview.creditor ?? "",
          lpPositions: lps,
        });
      }
    } catch {
      // Skip accounts that error
    }

    // Stop early if we have both variants
    const hasStaked = accounts.some((a) => a.lpPositions.some((lp) => lp.isStaked));
    const hasDebt = accounts.some((a) => a.hasDebt);
    if (hasStaked && hasDebt) break;
  }

  cachedAccounts = accounts;
  return accounts;
}

/** Find an account with an unstaked LP position and debt, or null. */
export function findAccountWithDebtAndLP(accounts: TestAccount[]) {
  const account = accounts.find((a) => a.hasDebt && a.lpPositions.some((lp) => !lp.isStaked));
  if (!account) return null;
  const lp = account.lpPositions.find((lp) => !lp.isStaked)!;
  return { account, lp };
}

/** Find an account with a staked LP position, or null. */
export function findAccountWithStakedLP(accounts: TestAccount[]) {
  const account = accounts.find((a) => a.lpPositions.some((lp) => lp.isStaked));
  if (!account) return null;
  const lp = account.lpPositions.find((lp) => lp.isStaked)!;
  return { account, lp };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Find a margin account (has creditor) — required for add-liquidity. */
export function findMarginAccount(accounts: TestAccount[]) {
  return accounts.find((a) => a.creditor && a.creditor !== ZERO_ADDRESS) ?? null;
}

interface StrategyStub {
  strategy_id: number;
  underlyings: Array<{ underlying_address: string; underlying_symbol: string }>;
}

/** Find a strategy that has USDC as one of its underlyings (good for testing add-liquidity). */
export async function findUsdcStrategy(api: ArcadiaApiClient): Promise<StrategyStub | null> {
  const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const strategies = (await api.getStrategies(CHAIN_ID)) as unknown as StrategyStub[];
  return (
    strategies.find((s) =>
      s.underlyings?.some((u) => u.underlying_address.toLowerCase() === USDC_BASE),
    ) ?? null
  );
}
