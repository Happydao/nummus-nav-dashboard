import { frozenHistory, maintenance } from "../src/utils/maintenance.js";
import { getCurrentMarketPrice } from "./sources/marketPrice.js";
import { collectMarketDepth } from "./sources/marketDepth.js";
import { getCurrentDexLiquidity } from "./sources/dexLiquidity.js";
import { getCurrentSupply } from "./sources/supply.js";
import { collectSupplyHistory } from "./sources/supplyHistory.js";
import { getCurrentVaultAssets } from "./sources/vaultAssets.js";
import { commitSnapshot, readHistory, readHolderState } from "./utils/historyStore.js";
import { divideOrNull, round } from "./utils/math.js";
import { valueVault } from "./pricing/valueVault.js";
import type { DailySnapshot, HistoryFile, HolderCursor } from "./types.js";
import { ZEC_MINT } from "./utils/constants.js";
import { collectHolderGrowth } from "./sources/holderGrowth.js";

export const sources = {
  getCurrentVaultAssets, getCurrentSupply, getCurrentMarketPrice, getCurrentDexLiquidity,
  valueVault, collectMarketDepth, collectHolderGrowth, collectSupplyHistory
};

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

async function attempt<T>(issues: string[], label: string, task: () => Promise<T>): Promise<T | null> {
  try { return await task(); }
  catch (error) {
    issues.push(label);
    console.warn(`${label} unavailable: ${error instanceof Error ? error.message : "source failed"}`);
    return null;
  }
}

// Invalid groups are omitted independently; derived values use only this observation's inputs.
export function validateSnapshot(snapshot: DailySnapshot): void {
  const issues = snapshot.collectionIssues ??= [];
  for (const key of ["vaultUsd", "supply", "marketPrice"] as const) {
    if (!positive(snapshot[key])) { snapshot[key] = null; issues.push(key); }
  }
  if (snapshot.valuationReport.unpricedAssets.length) { snapshot.vaultUsd = null; issues.push("vaultUsd"); }
  if (!nonNegative(snapshot.zecAmount)) { snapshot.zecAmount = null; issues.push("zecAmount"); }
  snapshot.nav = round(divideOrNull(snapshot.vaultUsd, snapshot.supply));
  snapshot.backing = round(snapshot.nav !== null && snapshot.marketPrice !== null ? snapshot.nav / snapshot.marketPrice * 100 : null);
  snapshot.premium = round(snapshot.marketPrice !== null && snapshot.nav !== null && snapshot.nav > 0 ? snapshot.marketPrice / snapshot.nav : null);
  if (!positive(snapshot.marketDepth?.buyDepthUsd) || !positive(snapshot.marketDepth?.sellDepthUsd)) {
    delete snapshot.marketDepth; issues.push("marketDepth");
  }
  const dex = snapshot.dexLiquidity;
  if (!dex || !positive(dex.totalLiquidityUsd) || !positive(dex.poolCount) ||
      dex.pools.length !== dex.poolCount || dex.pools.some((pool) => !positive(pool.liquidityUsd))) {
    delete snapshot.dexLiquidity; issues.push("dexLiquidity");
  }
  const holders = snapshot.holderGrowth;
  if (holders && (!positive(holders.holderCount) || !positive(holders.concentration.top10Pct) || !positive(holders.concentration.top50Pct))) {
    delete snapshot.holderGrowth; issues.push("holderGrowth");
  }
  snapshot.collectionIssues = [...new Set(issues)];
}

export async function collectDailySnapshot(deps = sources): Promise<DailySnapshot> {
  const issues: string[] = [];
  const [assets, supply, marketPrice, dexLiquidity] = await Promise.all([
    attempt(issues, "vaultUsd", () => deps.getCurrentVaultAssets()),
    attempt(issues, "supply", () => deps.getCurrentSupply()),
    attempt(issues, "marketPrice", () => deps.getCurrentMarketPrice()),
    attempt(issues, "dexLiquidity", () => deps.getCurrentDexLiquidity())
  ]);
  const [valuation, marketDepth] = await Promise.all([
    assets ? attempt(issues, "vaultUsd", () => deps.valueVault(assets.fungibleAssets, assets.ignoredAssets)) : null,
    positive(marketPrice) ? attempt(issues, "marketDepth", () => deps.collectMarketDepth(marketPrice)) : null
  ]);
  const snapshot: DailySnapshot = {
    date: new Date().toISOString().slice(0, 10),
    vaultUsd: valuation?.vaultUsd ?? null, supply, marketPrice,
    nav: null, backing: null, premium: null,
    tbtcAmount: null,
    zecAmount: assets?.fungibleAssets.find((asset) => asset.mint === ZEC_MINT)?.amount ?? null,
    ...(marketDepth ? { marketDepth } : {}), ...(dexLiquidity ? { dexLiquidity } : {}),
    valuationReport: valuation?.valuationReport ?? { source: "unavailable", pricedAssets: [], ignoredAssets: [], unpricedAssets: [] },
    collectionIssues: issues
  };
  validateSnapshot(snapshot);
  return snapshot;
}

export async function collectUpdate(history: HistoryFile, holderState: HolderCursor | undefined, deps = sources) {
  const snapshot = await collectDailySnapshot(deps);
  if (snapshot.date < maintenance.restartDate) throw new Error("ZEC collection cannot precede the restart date");
  const previous = history.records.find((record) => record.date === snapshot.date);
  const issues = snapshot.collectionIssues!;
  // Do not let a failed source mutate a cursor that will be retained on failure.
  const [holders, supply] = await Promise.all([
    snapshot.dexLiquidity ? attempt(issues, "holderGrowth", () => deps.collectHolderGrowth(snapshot.date,
      snapshot.dexLiquidity!.pools.map((pool) => ({ pairAddress: pool.pairAddress, dexId: pool.dexId })), structuredClone(holderState))) : null,
    snapshot.supply !== null ? attempt(issues, "supplyHistory", () => deps.collectSupplyHistory(snapshot.supply!, structuredClone(history.supplyHistory ?? []), structuredClone(history.supplyCursor))) : null
  ]);
  if (holders) snapshot.holderGrowth = holders.snapshot;
  else issues.push("holderGrowth");
  validateSnapshot(snapshot);
  if (![snapshot.vaultUsd, snapshot.supply, snapshot.marketPrice, snapshot.zecAmount].some(nonNegative) &&
      !snapshot.marketDepth && !snapshot.dexLiquidity && !snapshot.holderGrowth && !previous) {
    throw new Error("No valid current metrics; existing history remains unchanged");
  }
  if (supply) {
    // A full burn rescan must not rewrite the pre-transition published history.
    history.supplyHistory = [
      ...(history.supplyHistory ?? []).filter(point => point.date < maintenance.restartDate),
      ...supply.history.filter(point => point.date >= maintenance.restartDate)
    ];
    history.supplyCursor = supply.cursor;
  }
  const nextHolderState = snapshot.holderGrowth && holders ? holders.cursor : holderState;
  if (nextHolderState) delete history.holderCursor;
  // Preserve successful observations on an intraday retry, never copy an older day forward.
  if (previous) {
    const dailyKeys = ["vaultUsd", "supply", "marketPrice", "zecAmount", "marketDepth", "dexLiquidity", "holderGrowth"] as const;
    for (const key of dailyKeys) {
      if (snapshot[key] == null && previous[key] != null) Object.assign(snapshot, { [key]: previous[key] });
    }
    if (issues.includes("vaultUsd") && snapshot.vaultUsd === previous.vaultUsd) {
      snapshot.valuationReport = previous.valuationReport;
    }
    // Issues describe missing daily observations, not failed individual attempts.
    // History scans are usable only if a scan already succeeded on this UTC date.
    snapshot.collectionIssues = issues.filter(key =>
      !dailyKeys.some(dailyKey => dailyKey === key) &&
      !(["supplyHistory"].includes(key) &&
        !previous.collectionIssues?.includes(key))
    );
    validateSnapshot(snapshot);
    if (!snapshot.holderGrowth) snapshot.collectionIssues!.push("holderGrowth");
  }
  if (nonNegative(snapshot.zecAmount)) {
    const points = new Map((history.zecHistory ?? []).map(point => [point.date, point.amount]));
    points.set(snapshot.date, snapshot.zecAmount);
    history.zecHistory = [...points].sort(([a], [b]) => a.localeCompare(b)).map(([date, amount]) => ({ date, amount }));
  }
  const records = new Map(history.records.map((record) => [record.date, record]));
  records.set(snapshot.date, snapshot);
  history.records = [...records.values()].sort((a, b) => a.date.localeCompare(b.date));
  history.generatedAt = new Date().toISOString();
  Object.assign(history, frozenHistory(history));
  return { snapshot, history, holderState: nextHolderState ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (maintenance.enabled) {
    console.log(`Collection paused: dashboard frozen as of ${maintenance.frozenDate}.`);
    process.exit(0);
  }
  const history = await readHistory();
  const firstZecRun = !history.records.some(record => record.date >= maintenance.restartDate && positive(record.zecAmount) && positive(record.vaultUsd));
  const update = await collectUpdate(history, await readHolderState() ?? history.holderCursor);
  if (firstZecRun && (!positive(update.snapshot.zecAmount) || !positive(update.snapshot.vaultUsd) || !positive(update.snapshot.nav))) {
    throw new Error("Restart requires a verified ZEC balance, USD valuation and NAV; previous dataset remains unchanged");
  }
  await commitSnapshot(update.snapshot, update.history, update.holderState);
  console.log(`Saved ${update.snapshot.date}. Unavailable groups: ${update.snapshot.collectionIssues?.join(", ") || "none"}`);
}
