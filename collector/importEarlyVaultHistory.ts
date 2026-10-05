import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DailySnapshot, HistoryFile, PricedAsset, UnpricedAsset } from "./types.js";
import { HeliusClient } from "./sources/helius.js";
import { HISTORY_PATH } from "./utils/historyStore.js";
import { divideOrNull, round } from "./utils/math.js";
import { TBTC_MINT, VAULT_WALLET } from "./utils/constants.js";

const START_DATE = "2025-06-16";
const END_DATE = "2025-12-04";
const CACHE_DIR = resolve("data/cache/early-vault");
const DEFILLAMA_URL = "https://coins.llama.fi";
const FINANCIAL_HISTORY_START = "2025-09-01";
const INITIAL_NUMMUS_SUPPLY = 100_000_000;

const MINTS = {
  NUMMUS: "9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray",
  TBTC: "6DNSN2BJsaPFdFFc1zP37kkeNe4Usc1Sqkzr9C9vPWcU"
} as const;

const ASSETS: Record<string, { symbol: string; provider: string }> = {
  [MINTS.TBTC]: { symbol: "tBTC", provider: "DefiLlama daily close / last observed" },
};

interface EnhancedTransaction {
  signature: string;
  timestamp: number;
  transactionError: unknown;
  accountData?: Array<{
    account: string;
    nativeBalanceChange?: number;
    tokenBalanceChanges?: Array<{
      userAccount?: string;
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
    }>;
  }>;
}

interface DefiLlamaChart {
  coins?: Record<string, { prices?: Array<{ timestamp: number; price: number }> }>;
}

interface BalanceEvent {
  timestamp: number;
  mint: string;
  amount: number;
}

await mkdir(CACHE_DIR, { recursive: true });
const helius = new HeliusClient();
const history = JSON.parse(await readFile(HISTORY_PATH, "utf8")) as HistoryFile;
const [vaultTransactions, defiLlamaPrices] = await Promise.all([
  loadVaultTransactions(helius),
  loadDefiLlamaPrices()
]);

const priceByMint = new Map<string, Map<string, number>>();
for (const [mint, prices] of Object.entries(defiLlamaPrices)) {
  priceByMint.set(mint, expandDailyPrices(new Map(prices)));
}
const balanceEvents = collectBalanceEvents(vaultTransactions);
const records = buildRecords(history, balanceEvents, priceByMint);
const byDate = new Map(history.records.map((record) => [record.date, record]));
for (const record of records) byDate.set(record.date, record);
history.records = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
history.generatedAt = new Date().toISOString();
await writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`);

const complete = records.filter((record) => record.vaultUsd !== null);
const incomplete = records.filter((record) => record.vaultUsd === null);
console.log(
  `Imported ${records.length} early Vault day(s): ${complete.length} complete, ${incomplete.length} incomplete. ` +
    `Complete range ${complete.at(0)?.date ?? "none"} -> ${complete.at(-1)?.date ?? "none"}.`
);
if (incomplete.length > 0) {
  console.log(`Incomplete dates: ${incomplete.map((record) => record.date).join(", ")}`);
}
logBoundary(records, history.records.find((record) => record.date === "2025-12-05"));

async function loadVaultTransactions(client: HeliusClient): Promise<EnhancedTransaction[]> {
  return cached("vault-transactions.json", async () => {
    const transactions: EnhancedTransaction[] = [];
    let before: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const batch = await client.getEnhancedTransactionsByAddress<EnhancedTransaction>(VAULT_WALLET, {
        limit: 100,
        before
      });
      transactions.push(...batch);
      const last = batch.at(-1);
      if (!last || batch.length < 100 || last.timestamp <= startOfDay(START_DATE)) break;
      before = last.signature;
    }
    return transactions;
  });
}

async function loadDefiLlamaPrices(): Promise<Record<string, Array<[string, number]>>> {
  const mints = [MINTS.TBTC, MINTS.NUMMUS];
  const result: Record<string, Array<[string, number]>> = {};
  for (const mint of mints) {
    result[mint] = await cached(`defillama-${mint}.json`, async () => {
      const start = startOfDay(START_DATE);
      const span = daysBetween(START_DATE, END_DATE) + 1;
      const response = await fetch(
        `${DEFILLAMA_URL}/chart/solana:${mint}?start=${start}&span=${span}&period=1d`
      );
      if (!response.ok) throw new Error(`DefiLlama ${mint} failed with HTTP ${response.status}`);
      const payload = (await response.json()) as DefiLlamaChart;
      return (payload.coins?.[`solana:${mint}`]?.prices ?? [])
        .filter((point) => Number.isFinite(point.price) && point.price > 0)
        .map((point) => [toDate(point.timestamp), point.price] as [string, number]);
    });
  }
  return result;
}

function collectBalanceEvents(transactions: EnhancedTransaction[]): BalanceEvent[] {
  const events: BalanceEvent[] = [];
  for (const tx of transactions) {
    if (tx.transactionError !== null) continue;
    for (const account of tx.accountData ?? []) {
      for (const change of account.tokenBalanceChanges ?? []) {
        if (change.userAccount !== VAULT_WALLET || !ASSETS[change.mint]) continue;
        events.push({
          timestamp: tx.timestamp,
          mint: change.mint,
          amount:
            Number(change.rawTokenAmount.tokenAmount) / 10 ** change.rawTokenAmount.decimals
        });
      }
    }
  }
  return events.sort((a, b) => a.timestamp - b.timestamp);
}

function buildRecords(
  history: HistoryFile,
  events: BalanceEvent[],
  prices: Map<string, Map<string, number>>
): DailySnapshot[] {
  const balances = new Map<string, number>();
  const records: DailySnapshot[] = [];
  let eventIndex = 0;
  for (const date of dateRange(START_DATE, END_DATE)) {
    const dayEnd = startOfDay(addDays(date, 1));
    while (eventIndex < events.length && events[eventIndex].timestamp < dayEnd) {
      const event = events[eventIndex];
      balances.set(event.mint, (balances.get(event.mint) ?? 0) + event.amount);
      eventIndex += 1;
    }

    const tbtcAmount = latestTbtcAmount(history, date);
    if (tbtcAmount !== null) balances.set(TBTC_MINT, tbtcAmount);
    const pricedAssets: PricedAsset[] = [];
    const unpricedAssets: UnpricedAsset[] = [];
    let vaultUsd = 0;

    for (const [mint, rawAmount] of balances) {
      const amount = round(rawAmount) ?? rawAmount;
      if (amount <= 1e-12 || !ASSETS[mint]) continue;
      const priceUsd = prices.get(mint)?.get(date);
      if (!priceUsd) {
        unpricedAssets.push({
          symbol: ASSETS[mint].symbol,
          mint,
          amount,
          reason: "no verifiable public market price existed on or before this date"
        });
        continue;
      }
      const valueUsd = round(amount * priceUsd) ?? amount * priceUsd;
      vaultUsd += valueUsd;
      pricedAssets.push({
        symbol: ASSETS[mint].symbol,
        mint,
        amount,
        priceUsd,
        valueUsd,
        provider: ASSETS[mint].provider
      });
    }

    const resolvedVaultUsd = unpricedAssets.length === 0 ? round(vaultUsd) : null;
    const deriveFinancialMetrics = date >= FINANCIAL_HISTORY_START;
    const supply = deriveFinancialMetrics ? historicalSupply(history, date) : null;
    const marketPrice = deriveFinancialMetrics ? (prices.get(MINTS.NUMMUS)?.get(date) ?? null) : null;
    const nav = round(divideOrNull(resolvedVaultUsd, supply));
    const backing = round(
      nav !== null && marketPrice !== null && marketPrice !== 0 ? (nav / marketPrice) * 100 : null
    );
    const premium = round(
      marketPrice !== null && nav !== null && nav !== 0 ? marketPrice / nav : null
    );

    records.push({
      date,
      vaultUsd: resolvedVaultUsd,
      supply,
      marketPrice,
      nav,
      backing,
      premium,
      tbtcAmount,
      valuationReport: {
        source:
          `Historical reconstruction: Helius on-chain end-of-day Vault balances; ` +
          `DefiLlama/GeckoTerminal/on-chain pool closing prices`,
        pricedAssets,
        ignoredAssets: [],
        unpricedAssets
      }
    });
  }
  return records;
}

function latestTbtcAmount(history: HistoryFile, date: string): number | null {
  let amount: number | null = null;
  for (const point of history.tbtcHistory ?? []) {
    if (point.date > date) break;
    amount = point.amount;
  }
  return amount;
}

function historicalSupply(history: HistoryFile, date: string): number {
  let supply = INITIAL_NUMMUS_SUPPLY;
  for (const point of history.supplyHistory ?? []) {
    if (point.date > date) break;
    supply = point.supply;
  }
  return supply;
}

function expandDailyPrices(prices: Map<string, number>): Map<string, number> {
  const expanded = new Map<string, number>();
  let latest: number | null = null;
  for (const date of dateRange(START_DATE, END_DATE)) {
    latest = prices.get(date) ?? latest;
    if (latest !== null) expanded.set(date, latest);
  }
  return expanded;
}

async function cached<T>(name: string, loader: () => Promise<T>): Promise<T> {
  const path = resolve(CACHE_DIR, name);
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const value = await loader();
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
  return value;
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((startOfDay(end) - startOfDay(start)) / 86_400);
}

function startOfDay(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
}

function toDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function logBoundary(records: DailySnapshot[], next?: DailySnapshot): void {
  const last = records.at(-1);
  if (!last || !next) return;
  console.log(
    `Boundary: ${last.date}=${last.vaultUsd ?? "null"} USD; ` +
      `${next.date}=${next.vaultUsd ?? "null"} USD.`
  );
}
