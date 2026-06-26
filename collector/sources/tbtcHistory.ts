import type { TbtcSnapshot } from "../types.js";
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

export async function collectTbtcHistory(helius = new HeliusClient()): Promise<TbtcSnapshot[]> {
  const tokenAccounts = await getTbtcTokenAccounts(helius);
  const transactions: HeliusEnhancedTransaction[] = [];

  for (const address of [VAULT_WALLET, ...tokenAccounts]) {
    transactions.push(...(await getAllAddressTransactions(address, helius)));
  }

  const tokenAccountSet = new Set(tokenAccounts);
  const uniqueTransactions = [...new Map(transactions.map((tx) => [tx.signature, tx])).values()];
  const byDate = new Map<string, number>();
  let amount = 0;

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
  }

  return [...byDate.entries()].map(([date, value]) => ({
    date,
    amount: round(value) ?? value
  }));
}

async function getTbtcTokenAccounts(helius: HeliusClient): Promise<string[]> {
  const response = await helius.rpc<{
    value: Array<{
      pubkey: string;
    }>;
  }>("getTokenAccountsByOwner", [VAULT_WALLET, { mint: TBTC_MINT }, { encoding: "jsonParsed" }]);

  return response.value.map((account) => account.pubkey);
}

async function getAllAddressTransactions(
  address: string,
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
    transactions.push(...batch);
    before = batch.at(-1)?.signature;
    if (batch.length < 100) break;
  }

  return transactions;
}
