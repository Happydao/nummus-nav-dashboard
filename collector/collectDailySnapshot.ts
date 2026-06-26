import { getCurrentMarketPrice } from "./sources/marketPrice.js";
import { getCurrentSupply } from "./sources/supply.js";
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
  const [{ fungibleAssets, ignoredAssets }, supply, marketPrice] = await Promise.all([
    getCurrentVaultAssets(),
    getCurrentSupply(),
    getCurrentMarketPrice()
  ]);
  const { vaultUsd, valuationReport } = await valueVault(fungibleAssets, ignoredAssets);

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
    valuationReport
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const snapshot = await collectDailySnapshot();
  const history = await upsertToday(snapshot);
  history.tbtcHistory = await collectTbtcHistory();
  await writeHistory(history);
  console.log(
    `Saved ${snapshot.date} snapshot. History records: ${history.records.length}. tBTC points: ${history.tbtcHistory?.length ?? 0}`
  );
}
