import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readHistory, writeHistory } from "./utils/historyStore.js";
import { divideOrNull, round } from "./utils/math.js";
import type { DailySnapshot, HistoryFile, PricedAsset, SupplySnapshot } from "./types.js";
import { NUMMUS_MINT, TBTC_MINT } from "./utils/constants.js";

const DEFAULT_VAULTDAO_PATH = "../Nummus.VaultDAO";
const IMPORT_START = "2025-12-05T23:13:55Z";
const PRICES_PATH = "data/prices.json";
const PISTA_MINT = "9CaQUthsVMugZzMvskrrvcHXyjFqHGdNtGkPT8QSRACE";
const PUNCHY_MINT = "GnYufMbTAMz1DzkSN2DmwkBzjMTLkM22WvQuN1VCbonk";

interface VaultDaoPrices {
  timestamp?: string;
  total_usd_value?: number;
  nummus_price_usd?: number;
  tbtc_price_usd?: number;
  bumper?: {
    quantity?: number;
    price_usd?: number;
    total_value_usd?: number;
  };
  punchy?: {
    quantity?: number;
    price_usd?: number;
    total_value_usd?: number;
  };
  wallet_2?: {
    tbtc_balance?: number;
    tbtc_usd_value?: number;
  };
}

interface ImportedVaultSnapshot {
  date: string;
  timestamp: string;
  commit: string;
  prices: VaultDaoPrices;
}

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32
  });
}

function resolveVaultDaoPath(): string {
  const repoPath = resolve(process.env.VAULTDAO_REPO_PATH ?? DEFAULT_VAULTDAO_PATH);
  if (!existsSync(repoPath)) {
    throw new Error(`VaultDAO repo not found at ${repoPath}. Set VAULTDAO_REPO_PATH to the local clone.`);
  }
  return repoPath;
}

function collectVaultDaoSnapshots(repoPath: string): ImportedVaultSnapshot[] {
  const commits = git(repoPath, ["log", "--reverse", "--format=%H", "--", PRICES_PATH])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const byDate = new Map<string, ImportedVaultSnapshot>();

  for (const commit of commits) {
    const raw = git(repoPath, ["show", `${commit}:${PRICES_PATH}`]).trim();
    if (!raw) continue;

    const prices = JSON.parse(raw) as VaultDaoPrices;
    const timestamp = prices.timestamp;
    if (!timestamp || timestamp < IMPORT_START || !isFiniteNumber(prices.total_usd_value)) continue;

    byDate.set(timestamp.slice(0, 10), {
      date: timestamp.slice(0, 10),
      timestamp,
      commit: commit.slice(0, 8),
      prices
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildRecord(snapshot: ImportedVaultSnapshot, supplyHistory: SupplySnapshot[]): DailySnapshot {
  const vaultUsd = round(snapshot.prices.total_usd_value ?? null);
  const supply = findSupplyForDate(snapshot.date, supplyHistory);
  const marketPrice = round(snapshot.prices.nummus_price_usd ?? null);
  const nav = round(divideOrNull(vaultUsd, supply));
  const backing = round(
    nav !== null && marketPrice !== null && marketPrice !== 0 ? (nav / marketPrice) * 100 : null
  );
  const premium = round(
    marketPrice !== null && nav !== null && nav !== 0 ? marketPrice / nav : null
  );

  return {
    date: snapshot.date,
    vaultUsd,
    supply,
    marketPrice,
    nav,
    backing,
    premium,
    tbtcAmount: round(snapshot.prices.wallet_2?.tbtc_balance ?? null),
    valuationReport: {
      source: `Imported from Nummus.VaultDAO ${PRICES_PATH} commit ${snapshot.commit} at ${snapshot.timestamp}`,
      pricedAssets: pricedAssets(snapshot.prices),
      ignoredAssets: [],
      unpricedAssets: []
    }
  };
}

function findSupplyForDate(date: string, supplyHistory: SupplySnapshot[]): number | null {
  let supply: number | null = null;
  for (const snapshot of [...supplyHistory].sort((a, b) => a.date.localeCompare(b.date))) {
    if (snapshot.date > date) break;
    supply = snapshot.supply;
  }
  return supply;
}

function pricedAssets(prices: VaultDaoPrices): PricedAsset[] {
  return [
    {
      symbol: "tBTC",
      mint: TBTC_MINT,
      amount: numberOrZero(prices.wallet_2?.tbtc_balance),
      priceUsd: numberOrZero(prices.tbtc_price_usd),
      valueUsd: numberOrZero(prices.wallet_2?.tbtc_usd_value),
      provider: "Nummus.VaultDAO prices.json"
    },
    {
      symbol: "PISTA",
      mint: PISTA_MINT,
      amount: numberOrZero(prices.bumper?.quantity),
      priceUsd: numberOrZero(prices.bumper?.price_usd),
      valueUsd: numberOrZero(prices.bumper?.total_value_usd),
      provider: "Nummus.VaultDAO prices.json"
    },
    {
      symbol: "PUNCHY",
      mint: PUNCHY_MINT,
      amount: numberOrZero(prices.punchy?.quantity),
      priceUsd: numberOrZero(prices.punchy?.price_usd),
      valueUsd: numberOrZero(prices.punchy?.total_value_usd),
      provider: "Nummus.VaultDAO prices.json"
    }
  ];
}

function numberOrZero(value: number | undefined): number {
  return isFiniteNumber(value) ? value : 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mergeRecords(history: HistoryFile, importedRecords: DailySnapshot[]): HistoryFile {
  const recordsByDate = new Map(history.records.map((record) => [record.date, record]));
  for (const record of importedRecords) {
    if (!recordsByDate.has(record.date)) {
      recordsByDate.set(record.date, record);
    }
  }

  return {
    ...history,
    generatedAt: new Date().toISOString(),
    records: [...recordsByDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  };
}

const repoPath = resolveVaultDaoPath();
const history = await readHistory();
const snapshots = collectVaultDaoSnapshots(repoPath);
const importedRecords = snapshots.map((snapshot) => buildRecord(snapshot, history.supplyHistory ?? []));
const before = history.records.length;
const next = mergeRecords(history, importedRecords);
await writeHistory(next);

console.log(
  `Imported ${next.records.length - before} new daily VaultDAO record(s) from ${snapshots.length} daily snapshot(s). Total records: ${next.records.length}.`
);
