import type { TbtcCursor, TbtcSnapshot } from "../types.js";
import { TBTC_MINT, VAULT_WALLET } from "../utils/constants.js";
import { round } from "../utils/math.js";
import { HeliusClient } from "./helius.js";

interface HeliusEnhancedTransaction {
  signature: string;
  timestamp: number;
  transactionError: unknown;
  accountData?: Array<{
    tokenBalanceChanges?: Array<{
      userAccount?: string;
      tokenAccount?: string;
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
    }>;
  }>;
}

export async function collectTbtcHistory(
  existingHistory: TbtcSnapshot[] = [],
  existingCursor?: TbtcCursor,
  helius = new HeliusClient()
): Promise<{ history: TbtcSnapshot[]; cursor: TbtcCursor }> {
  const tokenAccounts = await getTbtcTokenAccounts(helius);
  const processedSignatures = new Set(existingCursor?.processedSignatures ?? []);
  const isIncremental = Boolean(
    existingHistory.length > 0 &&
    existingCursor &&
    sameStringSet(existingCursor.tokenAccounts, tokenAccounts)
  );
  const transactions: HeliusEnhancedTransaction[] = [];

  for (const address of [VAULT_WALLET, ...tokenAccounts]) {
    transactions.push(
      ...(await getAddressTransactionsUntilKnown(address, processedSignatures, isIncremental, helius))
    );
  }

  const tokenAccountSet = new Set(tokenAccounts);
  const uniqueTransactions = [...new Map(transactions.map((tx) => [tx.signature, tx])).values()];
  const byDate = new Map(existingHistory.map((point) => [point.date, point.amount]));
  let amount = isIncremental && existingCursor ? existingCursor.lastAmount : 0;

  for (const tx of uniqueTransactions
    .filter((item) => item.transactionError === null)
    .sort((a, b) => a.timestamp - b.timestamp)) {
    let delta = 0;

    for (const account of tx.accountData ?? []) {
      for (const change of account.tokenBalanceChanges ?? []) {
        if (change.mint !== TBTC_MINT || !tokenAccountSet.has(change.tokenAccount ?? "")) continue;
        delta +=
          Number(change.rawTokenAmount.tokenAmount) / 10 ** change.rawTokenAmount.decimals;
      }
    }

    if (delta !== 0) {
      amount += delta;
      byDate.set(new Date(tx.timestamp * 1000).toISOString().slice(0, 10), amount);
    }

    processedSignatures.add(tx.signature);
  }

  const history = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date,
      amount: round(value) ?? value
    }));
  const cursor = {
    tokenAccounts,
    processedSignatures: [...processedSignatures],
    lastAmount: history.at(-1)?.amount ?? 0
  };

  return { history, cursor };
}

async function getTbtcTokenAccounts(helius: HeliusClient): Promise<string[]> {
  const response = await helius.rpc<{
    value: Array<{
      pubkey: string;
    }>;
  }>("getTokenAccountsByOwner", [VAULT_WALLET, { mint: TBTC_MINT }, { encoding: "jsonParsed" }]);

  return response.value.map((account) => account.pubkey);
}

async function getAddressTransactionsUntilKnown(
  address: string,
  processedSignatures: Set<string>,
  stopAtKnown: boolean,
  helius: HeliusClient
): Promise<HeliusEnhancedTransaction[]> {
  const transactions: HeliusEnhancedTransaction[] = [];
  let before: string | undefined;

  for (let page = 0; page < 100; page += 1) {
    const batch = await helius.getEnhancedTransactionsByAddress<HeliusEnhancedTransaction>(
      address,
      { limit: 100, before }
    );

    if (batch.length === 0) break;
    for (const tx of batch) {
      if (stopAtKnown && processedSignatures.has(tx.signature)) {
        return transactions;
      }

      transactions.push(tx);
    }

    before = batch.at(-1)?.signature;
    if (batch.length < 100) break;
  }

  return transactions;
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((item) => set.has(item));
}
