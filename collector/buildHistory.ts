import { collectBurnHistory } from "./collectBurnHistory.js";
import { collectPriceHistory } from "./collectPriceHistory.js";
import { collectSupplyHistory } from "./collectSupplyHistory.js";
import { collectVaultHistory } from "./collectVaultHistory.js";
import { todayIsoDate } from "../src/utils/dates.js";
import { divideOrNull, round } from "../src/utils/math.js";
import type { CollectionWarning, GeneratedHistory, HistoryRecord } from "../src/utils/types.js";
import { coverageFor, HISTORY_PATH, readHistory, upsertRecords, writeHistory } from "./historyStore.js";

export async function buildHistory(): Promise<GeneratedHistory> {
  const [vaultResult, supplyResult, priceResult, burnResult] = await Promise.all([
    collectVaultHistory(),
    collectSupplyHistory(),
    collectPriceHistory(),
    collectBurnHistory()
  ]);

  const dates = new Set<string>();
  for (const snapshot of vaultResult.data) dates.add(snapshot.date);
  for (const snapshot of supplyResult.data) dates.add(snapshot.date);
  for (const snapshot of priceResult.data) dates.add(snapshot.date);

  const records: HistoryRecord[] = [...dates].sort().map((date) => {
    const vaultUsd = vaultResult.data.find((snapshot) => snapshot.date === date)?.vaultUsd ?? null;
    const supply = supplyResult.data.find((snapshot) => snapshot.date === date)?.uiAmount ?? null;
    const marketPrice =
      priceResult.data.find((snapshot) => snapshot.date === date)?.priceUsd ?? null;

    const nav = round(divideOrNull(vaultUsd, supply));
    const backing = round(
      nav !== null && marketPrice !== null && marketPrice !== 0 ? (nav / marketPrice) * 100 : null
    );
    const premium = round(
      marketPrice !== null && nav !== null && nav !== 0 ? marketPrice / nav : null
    );

    return {
      date,
      vaultUsd,
      supply,
      marketPrice,
      nav,
      backing,
      premium
    };
  });

  const warnings: CollectionWarning[] = [
    ...vaultResult.warnings,
    ...supplyResult.warnings,
    ...priceResult.warnings,
    ...burnResult.warnings
  ];

  if (records.some((record) => record.vaultUsd === null)) {
    warnings.push({
      metric: "history",
      message:
        "NAV, treasury backing, and premium remain null until vault USD history and market price history are available for the same dates."
    });
  }

  const existing = await readHistory();
  const mergedRecords = upsertRecords(existing?.records ?? [], records);
  const today = todayIsoDate();
  const historicalRecords = mergedRecords.filter((record) => record.date < today);

  if (historicalRecords.some((record) => record.vaultUsd === null)) {
    warnings.push({
      metric: "vaultUsd",
      message:
        "Historical vaultUsd remains null for backfill dates until a treasury transaction replay layer reconstructs end-of-day Realms treasury balances. The daily collector only updates the current date."
    });
  }

  if (historicalRecords.some((record) => record.supply === null)) {
    warnings.push({
      metric: "supply",
      message:
        "Historical supply remains null for backfill dates until a NUMMUS mint/burn replay layer reconstructs supply as of each snapshot date. The daily collector only updates current supply."
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    coverage: coverageFor(mergedRecords),
    warnings,
    vaultValuation: vaultResult.data.at(-1) ?? null,
    burnEvents: burnResult.data,
    records: mergedRecords
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const history = await buildHistory();
  await writeHistory(history);
  console.log(`Wrote ${history.records.length} history records to ${HISTORY_PATH}`);
}
