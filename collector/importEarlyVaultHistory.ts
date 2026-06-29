import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DailySnapshot, HistoryFile, PricedAsset, UnpricedAsset } from "./types.js";
import { HeliusClient } from "./sources/helius.js";
import { HISTORY_PATH } from "./utils/historyStore.js";
import { divideOrNull, round } from "./utils/math.js";
import { VAULT_WALLET, WRAPPED_SOL_MINT } from "./utils/constants.js";

const START_DATE = "2025-06-16";
const END_DATE = "2025-12-04";
const CACHE_DIR = resolve("data/cache/early-vault");
const DEFILLAMA_URL = "https://coins.llama.fi";
const GECKOTERMINAL_URL = "https://api.geckoterminal.com/api/v2";
const FINANCIAL_HISTORY_START = "2025-09-01";
const INITIAL_NUMMUS_SUPPLY = 100_000_000;

const MINTS = {
  NUMMUS: "9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray",
  TBTC: "6DNSN2BJsaPFdFFc1zP37kkeNe4Usc1Sqkzr9C9vPWcU",
  BUMPER: "5bp5PwTyu4i1hGyQsRwRYqiR2CmxyHt2cPJGEbXEbonk",
  PUNCHY: "GnYufMbTAMz1DzkSN2DmwkBzjMTLkM22WvQuN1VCbonk",
  MOONPUMP: "HfbgFAG3jjJXGYm8vxskaEXveVpyaAYFur3miLvzpump",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
} as const;

const ASSETS: Record<string, { symbol: string; provider: string }> = {
  [WRAPPED_SOL_MINT]: { symbol: "SOL", provider: "DefiLlama daily close / last observed" },
  [MINTS.NUMMUS]: { symbol: "NUMMUS", provider: "DefiLlama daily close / last observed" },
  [MINTS.TBTC]: { symbol: "tBTC", provider: "DefiLlama daily close / last observed" },
  [MINTS.BUMPER]: {
    symbol: "PISTA (legacy BUMPER)",
    provider: "DefiLlama daily close / last observed"
  },
  [MINTS.PUNCHY]: {
    symbol: "PUNCHY",
    provider: "Helius last on-chain pool trade x DefiLlama SOL/USD"
  },
  [MINTS.MOONPUMP]: {
    symbol: "MOONPUMP",
    provider: "GeckoTerminal daily OHLCV close / last observed"
  },
  [MINTS.JUP]: { symbol: "JUP", provider: "DefiLlama daily close / last observed" }
};

const PUNCHY_POOL = "3e5hfyfEMVjwx3LA1L6ZGnViBWR5Cj7GcWojKWjo6Etn";
const MOONPUMP_POOL = "2n8U1zCXX5uFqsq2RDKfit424QypuCSbFJuazC4Wg2tk";

const PUNCHY_DAILY_CLOSE_SIGNATURES = [
  "5stLdDfK9neKs2rHkGNuTRaG9aS5RiGnRot1SZ3ySrDfGtee74WcS5pgYsVWTvVpnyVd5Dbs2mct3JQuRa9HoiDU",
  "4UFi8JzY2otnhL371jf4xyzzHbFCgdr8N5eqWybBuuJkB1G5QjAyoU2rFzjUaySuFvqWktb94VNWCXxfs4mP4vin",
  "2NShCuYHVJpeEnWCHfBb6ASkHGvB688kSaLsF7wB2pdh2MR99VndLxU9vR2TzQ54ToyAutBqhoq7QMQzT771iwNA",
  "2xUB2F5cwVDWaJ7CbnbRwQrujrb2wg5QdWKtyk3PLk7JG99sThDKYriEtKgxN8L634zC1hvPDZ49ynyEqczNornK",
  "YNJ4VwY18T68HqKoy9eGbxzZkVCc3U9qQLZZvL8vg8TBWYWoNSmAGKfdttmMMa56xkoLU4MYriFmMt3u1cP4KHm",
  "2CSe7ivP9qu7Q5F3FLMkkaYL8yECv1g7uYS2n27CRab9XkWp8W1BqvCZAfe9hC1Mm9GWg3Q42MeRqjLuBpbfzKKh",
  "59KTrq7bexnKFW4C7fysPwgKUz3V9ybg41PAq51J3X4XhWJ7acvv5BKtEGWGbhE65DMvMffC3JGib1ZEfme1viNS",
  "3EnUDCyrWmhMRimMNeP92tg8wdG9ctdHf7zYBscY9Qbm4mXyV2xSBf5m9q2aFHJL1o5gLLiCj94K63PQRN74h3nZ",
  "4M3URZh39CfSCwQiRUcWtGNeLgBBUw8v37VsW96TAY8eyLUPGyA1kRUeBMamqihL4Dsg1TrxH9yeH8apzhjY3Sj4",
  "5tR7UCABV4YC7vUBUuGs2YAjqAXnk2qDaLA4b62NXfDohJHyf1fBjypCJvkmoCzfz5cjBTPxcZRW9QsyXBn8jiS2",
  "wQWhx7pCsEB7YPJf9UwJ9RVZ72nChiKPxi8a9UAx2gmr3SBmSww8hiC1c5Mdbe3KE2eW1iqt3ivWv5z3PLAFRxH",
  "2iRKBc2qrtHEXNGCD17jUbMr5GkSEuyCfdoekdQSH9X3ofi4pSUJFVT7zrzTKfSz3xV4aP3ZATk8cYPG35PFvEFe"
];

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
  tokenTransfers?: Array<{ mint: string; tokenAmount: number }>;
}

interface DefiLlamaChart {
  coins?: Record<string, { prices?: Array<{ timestamp: number; price: number }> }>;
}

interface DefiLlamaHistorical {
  coins?: Record<string, { timestamp?: number; price?: number }>;
}

interface GeckoOhlcv {
  data?: { attributes?: { ohlcv_list?: number[][] } };
}

interface BalanceEvent {
  timestamp: number;
  mint: string;
  amount: number;
}

await mkdir(CACHE_DIR, { recursive: true });
const helius = new HeliusClient();
const history = JSON.parse(await readFile(HISTORY_PATH, "utf8")) as HistoryFile;
const [vaultTransactions, punchyTransactions, defiLlamaPrices, moonpumpPrices] = await Promise.all([
  loadVaultTransactions(helius),
  cached("punchy-daily-close-transactions.json", () =>
    helius.getEnhancedTransactions<EnhancedTransaction>(PUNCHY_DAILY_CLOSE_SIGNATURES)
  ),
  loadDefiLlamaPrices(),
  loadMoonpumpPrices()
]);

const priceByMint = new Map<string, Map<string, number>>();
for (const [mint, prices] of Object.entries(defiLlamaPrices)) {
  priceByMint.set(mint, expandDailyPrices(new Map(prices)));
}
priceByMint.set(MINTS.MOONPUMP, expandDailyPrices(new Map(moonpumpPrices)));
priceByMint.set(
  MINTS.PUNCHY,
  expandDailyPrices(derivePunchyPrices(punchyTransactions, priceByMint.get(WRAPPED_SOL_MINT)))
);

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
  const mints = [WRAPPED_SOL_MINT, MINTS.NUMMUS, MINTS.TBTC, MINTS.BUMPER, MINTS.JUP];
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
  const bumperBootstrap = await cached("defillama-bumper-bootstrap.json", async () => {
    const requested = startOfDay("2025-08-02");
    const response = await fetch(
      `${DEFILLAMA_URL}/prices/historical/${requested}/solana:${MINTS.BUMPER}?searchWidth=24h`
    );
    if (!response.ok) throw new Error(`DefiLlama BUMPER bootstrap failed with HTTP ${response.status}`);
    const payload = (await response.json()) as DefiLlamaHistorical;
    const point = payload.coins?.[`solana:${MINTS.BUMPER}`];
    return point?.timestamp && point.price ? ([toDate(point.timestamp), point.price] as [string, number]) : null;
  });
  if (bumperBootstrap) result[MINTS.BUMPER].push(bumperBootstrap);
  return result;
}

async function loadMoonpumpPrices(): Promise<Array<[string, number]>> {
  return cached("geckoterminal-moonpump.json", async () => {
    const response = await fetch(
      `${GECKOTERMINAL_URL}/networks/solana/pools/${MOONPUMP_POOL}/ohlcv/day?aggregate=1&limit=1000&currency=usd&token=base`
    );
    if (!response.ok) throw new Error(`GeckoTerminal MOONPUMP failed with HTTP ${response.status}`);
    const payload = (await response.json()) as GeckoOhlcv;
    return (payload.data?.attributes?.ohlcv_list ?? [])
      .filter((row) => Number.isFinite(row[4]) && row[4] > 0)
      .map((row) => [toDate(row[0]), row[4]] as [string, number]);
  });
}

function derivePunchyPrices(
  transactions: EnhancedTransaction[],
  solPrices?: Map<string, number>
): Map<string, number> {
  const prices = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.transactionError !== null) continue;
    const date = toDate(tx.timestamp);
    const punchy = largestTransfer(tx, MINTS.PUNCHY);
    const sol = largestTransfer(tx, WRAPPED_SOL_MINT);
    const solUsd = solPrices?.get(date);
    if (!punchy || !sol || !solUsd) continue;
    prices.set(date, (sol / punchy) * solUsd);
  }
  return prices;
}

function largestTransfer(tx: EnhancedTransaction, mint: string): number | null {
  const amount = (tx.tokenTransfers ?? [])
    .filter((transfer) => transfer.mint === mint && transfer.tokenAmount > 0)
    .sort((a, b) => b.tokenAmount - a.tokenAmount)[0]?.tokenAmount;
  return amount && Number.isFinite(amount) ? amount : null;
}

function collectBalanceEvents(transactions: EnhancedTransaction[]): BalanceEvent[] {
  const events: BalanceEvent[] = [];
  for (const tx of transactions) {
    if (tx.transactionError !== null) continue;
    for (const account of tx.accountData ?? []) {
      if (account.account === VAULT_WALLET && account.nativeBalanceChange) {
        events.push({
          timestamp: tx.timestamp,
          mint: WRAPPED_SOL_MINT,
          amount: account.nativeBalanceChange / 1_000_000_000
        });
      }
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
    if (tbtcAmount !== null) balances.set(MINTS.TBTC, tbtcAmount);
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
