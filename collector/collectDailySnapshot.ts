import { getCurrentMarketPrice } from "./sources/marketPrice.js";
import { collectMarketDepth } from "./sources/marketDepth.js";
import { getCurrentDexLiquidity } from "./sources/dexLiquidity.js";
import { getCurrentSupply } from "./sources/supply.js";
import { collectSupplyHistory } from "./sources/supplyHistory.js";
import { collectTbtcHistory } from "./sources/tbtcHistory.js";
import { getCurrentVaultAssets } from "./sources/vaultAssets.js";
import { upsertToday, writeHistory } from "./utils/historyStore.js";
import { divideOrNull, round } from "./utils/math.js";
import { valueVault } from "./pricing/valueVault.js";
import type { DailySnapshot } from "./types.js";
import { TBTC_MINT } from "./utils/constants.js";

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
  const history = await upsertToday(snapshot);
  const tbtc = await collectTbtcHistory(history.tbtcHistory ?? [], history.tbtcCursor);
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
  await writeHistory(history);
  console.log(
    `Saved ${snapshot.date} snapshot. History records: ${history.records.length}. tBTC points: ${history.tbtcHistory?.length ?? 0}. Supply points: ${history.supplyHistory?.length ?? 0}`
  );
}
