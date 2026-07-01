import { getCurrentMarketPrice } from "./sources/marketPrice.js";
import { collectMarketDepth } from "./sources/marketDepth.js";
import { getCurrentDexLiquidity } from "./sources/dexLiquidity.js";
import { getCurrentSupply } from "./sources/supply.js";
import { collectSupplyHistory } from "./sources/supplyHistory.js";
import { collectTbtcHistory } from "./sources/tbtcHistory.js";
import { getCurrentVaultAssets } from "./sources/vaultAssets.js";
import { commitSnapshot, readHistory, readHolderState } from "./utils/historyStore.js";
import { divideOrNull, round } from "./utils/math.js";
import { valueVault } from "./pricing/valueVault.js";
import type { DailySnapshot } from "./types.js";
import { TBTC_MINT } from "./utils/constants.js";
import { collectHolderGrowth } from "./sources/holderGrowth.js";

function requirePositive(label: string, value: number | null | undefined): void {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Incomplete snapshot: ${label} is missing or invalid`);
  }
}

function requireNonNegative(label: string, value: number | null | undefined): void {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    throw new Error(`Incomplete snapshot: ${label} is missing or invalid`);
  }
}

export function validateSnapshot(snapshot: DailySnapshot): void {
  requirePositive("Vault Value", snapshot.vaultUsd);
  requirePositive("NUMMUS supply", snapshot.supply);
  requirePositive("NUMMUS market price", snapshot.marketPrice);
  requirePositive("NAV", snapshot.nav);
  requirePositive("Treasury Backing", snapshot.backing);
  requirePositive("Premium vs NAV", snapshot.premium);
  requireNonNegative("tBTC amount", snapshot.tbtcAmount);
  requirePositive("Market Depth buy side", snapshot.marketDepth?.buyDepthUsd);
  requirePositive("Market Depth sell side", snapshot.marketDepth?.sellDepthUsd);
  requirePositive("DEX total liquidity", snapshot.dexLiquidity?.totalLiquidityUsd);
  requirePositive("DEX pool count", snapshot.dexLiquidity?.poolCount);

  if (
    !snapshot.dexLiquidity ||
    snapshot.dexLiquidity.pools.length !== snapshot.dexLiquidity.poolCount ||
    snapshot.dexLiquidity.pools.some((pool) => !Number.isFinite(pool.liquidityUsd) || pool.liquidityUsd <= 0)
  ) {
    throw new Error("Incomplete snapshot: DEX pool data is missing or invalid");
  }

  if (snapshot.valuationReport.unpricedAssets.length > 0) {
    throw new Error(
      `Incomplete snapshot: ${snapshot.valuationReport.unpricedAssets.length} vault asset(s) could not be priced`
    );
  }

  requirePositive("holder count", snapshot.holderGrowth?.holderCount);
  requirePositive("Top 10 holder concentration", snapshot.holderGrowth?.concentration.top10Pct);
  requirePositive("Top 50 holder concentration", snapshot.holderGrowth?.concentration.top50Pct);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function collectDailySnapshot(): Promise<DailySnapshot> {
  const [{ fungibleAssets, ignoredAssets }, supply, marketPrice, dexLiquidity] = await Promise.all([
    getCurrentVaultAssets(),
    getCurrentSupply(),
    getCurrentMarketPrice(),
    getCurrentDexLiquidity()
  ]);
  const [{ vaultUsd, valuationReport }, marketDepth] = await Promise.all([
    valueVault(fungibleAssets, ignoredAssets),
    collectMarketDepth(marketPrice)
  ]);

  const nav = round(divideOrNull(vaultUsd, supply));
  const backing = round(
    nav !== null && marketPrice !== null && marketPrice !== 0 ? (nav / marketPrice) * 100 : null
  );
  const premium = round(
    marketPrice !== null && nav !== null && nav !== 0 ? marketPrice / nav : null
  );
  const tbtcAmount = fungibleAssets.find((asset) => asset.mint === TBTC_MINT)?.amount ?? null;

  return {
    date: today(),
    vaultUsd,
    supply,
    marketPrice,
    nav,
    backing,
    premium,
    tbtcAmount,
    marketDepth,
    dexLiquidity,
    valuationReport
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snapshot = await collectDailySnapshot();
  const history = await readHistory();
  const holderState = await readHolderState() ?? history.holderCursor;
  const [tbtc, holders] = await Promise.all([
    collectTbtcHistory(history.tbtcHistory ?? [], history.tbtcCursor),
    collectHolderGrowth(
      snapshot.date,
      snapshot.dexLiquidity?.pools.map((pool) => ({
        pairAddress: pool.pairAddress,
        dexId: pool.dexId
      })) ?? [],
      holderState
    )
  ]);
  snapshot.holderGrowth = holders.snapshot;
  validateSnapshot(snapshot);
  const supply = await collectSupplyHistory(
    snapshot.supply ?? 0,
    history.supplyHistory ?? [],
    history.supplyCursor
  );
  if (snapshot.tbtcAmount !== null) {
    const tbtcByDate = new Map(tbtc.history.map((point) => [point.date, point.amount]));
    tbtcByDate.set(snapshot.date, snapshot.tbtcAmount);
    tbtc.history = [...tbtcByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));
    tbtc.cursor.lastAmount = snapshot.tbtcAmount;
  }

  history.tbtcHistory = tbtc.history;
  history.tbtcCursor = tbtc.cursor;
  history.supplyHistory = supply.history;
  history.supplyCursor = supply.cursor;
  delete history.holderCursor;
  const recordsByDate = new Map(history.records.map((record) => [record.date, record]));
  recordsByDate.set(snapshot.date, snapshot);
  history.records = [...recordsByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  history.generatedAt = new Date().toISOString();

  await commitSnapshot(snapshot, history, holders.cursor);
  console.log(
    `Saved ${snapshot.date} snapshot. History records: ${history.records.length}. tBTC points: ${history.tbtcHistory?.length ?? 0}. Supply points: ${history.supplyHistory?.length ?? 0}`
  );
}
