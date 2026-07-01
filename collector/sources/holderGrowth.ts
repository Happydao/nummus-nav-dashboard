import type { HolderCursor, HolderSnapshot } from "../types.js";
import { BURN_WALLET, NUMMUS_MINT, VAULT_WALLET } from "../utils/constants.js";
import { HeliusClient } from "./helius.js";

const PAGE_LIMIT = 1_000;
const MAX_PAGES = 100;

interface TokenAccount {
  address: string;
  owner: string;
  amount: number | string;
}

interface TokenAccountsPage {
  total: number;
  cursor?: string;
  token_accounts: TokenAccount[];
}

export async function collectHolderGrowth(
  date: string,
  pools: Array<{ pairAddress: string; dexId: string }>,
  existingCursor?: HolderCursor,
  helius = new HeliusClient()
): Promise<{ snapshot: HolderSnapshot; cursor: HolderCursor }> {
  const balances = new Map<string, bigint>();
  const tokenAccountsByAddress = new Map<string, TokenAccount>();
  let cursor: string | undefined;
  let fetchedAccounts = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await helius.rpc<TokenAccountsPage>("getTokenAccounts", {
      mint: NUMMUS_MINT,
      limit: PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
      options: { showZeroBalance: false }
    });
    if (!Array.isArray(result.token_accounts) || !Number.isInteger(result.total)) {
      throw new Error("Invalid Helius holder response");
    }
    if (result.total !== result.token_accounts.length) {
      throw new Error(
        `Incomplete Helius holder page: received ${result.token_accounts.length} of ${result.total} accounts`
      );
    }
    fetchedAccounts += result.token_accounts.length;
    for (const account of result.token_accounts) {
      if (!account.address || !account.owner) throw new Error("Holder response contains an incomplete account");
      tokenAccountsByAddress.set(account.address, account);
      const amount = BigInt(account.amount);
      if (amount > 0n) balances.set(account.owner, (balances.get(account.owner) ?? 0n) + amount);
    }
    cursor = result.cursor;
    if (!cursor) break;
    if (page === MAX_PAGES - 1) throw new Error("Holder pagination exceeded safety limit");
  }

  if (fetchedAccounts === 0 || balances.size === 0) throw new Error("No NUMMUS holders returned by Helius");

  const poolVaults = existingCursor?.poolVaultVersion === 1
    ? { ...(existingCursor.poolVaults ?? {}) }
    : {};
  for (const { pairAddress: poolAddress, dexId } of pools) {
    if (!poolVaults[poolAddress]) {
      poolVaults[poolAddress] = dexId === "orca"
        ? await discoverOrcaPoolVault(poolAddress)
        : await discoverPoolVault(poolAddress, helius);
    }
  }

  const poolOwners = new Set<string>();
  for (const vaultAddress of Object.values(poolVaults)) {
    const account = tokenAccountsByAddress.get(vaultAddress);
    if (!account) throw new Error(`NUMMUS pool vault ${vaultAddress} is absent from holder accounts`);
    poolOwners.add(account.owner);
  }
  const excludedOwners = new Set([VAULT_WALLET, BURN_WALLET, ...poolOwners]);
  const adjustedBalances = [...balances.entries()]
    .filter(([owner]) => !excludedOwners.has(owner))
    .map(([, amount]) => amount)
    .sort((a, b) => a === b ? 0 : a > b ? -1 : 1);

  const owners = [...balances.keys()].sort();
  const sameDate = existingCursor?.date === date;
  const baselineOwners = sameDate
    ? (existingCursor?.baselineDate ? existingCursor.baselineOwners : undefined)
    : existingCursor?.owners;
  const baselineDate = sameDate ? existingCursor?.baselineDate : existingCursor?.date;

  const snapshot: HolderSnapshot = {
    holderCount: owners.length,
    newHolders: baselineOwners ? differenceCount(owners, baselineOwners) : null,
    exitedHolders: baselineOwners ? differenceCount(baselineOwners, owners) : null,
    concentration: concentration(adjustedBalances, poolOwners.size)
  };

  return {
    snapshot,
    cursor: {
      date,
      owners,
      poolVaults,
      poolVaultVersion: 1,
      ...(baselineDate && baselineOwners ? { baselineDate, baselineOwners } : {})
    }
  };
}

interface OrcaPoolResponse {
  data?: {
    tokenMintA?: string;
    tokenMintB?: string;
    tokenVaultA?: string;
    tokenVaultB?: string;
  };
}

async function discoverOrcaPoolVault(poolAddress: string): Promise<string> {
  const response = await fetch(`https://api.orca.so/v2/solana/pools/${poolAddress}`);
  if (!response.ok) throw new Error(`Orca pool lookup failed with HTTP ${response.status}`);
  const pool = (await response.json() as OrcaPoolResponse).data;
  const vault = pool?.tokenMintA === NUMMUS_MINT
    ? pool.tokenVaultA
    : pool?.tokenMintB === NUMMUS_MINT
      ? pool.tokenVaultB
      : null;
  if (!vault) throw new Error(`Orca pool ${poolAddress} has no verified NUMMUS vault`);
  return vault;
}

interface EnhancedTransaction {
  transactionError: unknown;
  accountData?: Array<{
    tokenBalanceChanges?: Array<{ mint: string; tokenAccount?: string }>;
  }>;
}

async function discoverPoolVault(poolAddress: string, helius: HeliusClient): Promise<string> {
  const transactions = await helius.getEnhancedTransactionsByAddress<EnhancedTransaction>(poolAddress, { limit: 20 });
  const occurrences = new Map<string, number>();
  for (const transaction of transactions.filter((item) => item.transactionError === null)) {
    const seenInTransaction = new Set<string>();
    for (const account of transaction.accountData ?? []) {
      for (const change of account.tokenBalanceChanges ?? []) {
        if (change.mint === NUMMUS_MINT && change.tokenAccount) seenInTransaction.add(change.tokenAccount);
      }
    }
    for (const tokenAccount of seenInTransaction) {
      occurrences.set(tokenAccount, (occurrences.get(tokenAccount) ?? 0) + 1);
    }
  }
  const ranked = [...occurrences.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked[0] || ranked[0][1] < 2 || ranked[0][1] === ranked[1]?.[1]) {
    throw new Error(`Unable to identify the NUMMUS vault for pool ${poolAddress} with certainty`);
  }
  return ranked[0][0];
}

function concentration(sortedBalances: bigint[], excludedPoolCount: number): HolderSnapshot["concentration"] {
  const total = sortedBalances.reduce((sum, value) => sum + value, 0n);
  if (total <= 0n) throw new Error("Adjusted NUMMUS holder balance is zero");
  const sum = (count: number) => sortedBalances.slice(0, count).reduce((acc, value) => acc + value, 0n);
  const topHolder = sum(1);
  const top10 = sum(10);
  const top50 = sum(50);
  const others = total - top50;
  const amount = (value: bigint) => Number(value) / 1_000_000;
  const pct = (value: bigint) => Number((value * 1_000_000n) / total) / 10_000;
  return {
    topHolderPct: pct(topHolder), top10Pct: pct(top10), top50Pct: pct(top50), othersPct: pct(others),
    topHolderAmount: amount(topHolder), top10Amount: amount(top10), top50Amount: amount(top50), othersAmount: amount(others),
    excludedPoolCount
  };
}

function differenceCount(values: string[], reference: string[]): number {
  const referenceSet = new Set(reference);
  return values.reduce((count, value) => count + (referenceSet.has(value) ? 0 : 1), 0);
}
