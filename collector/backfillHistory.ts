import {
  BACKFILL_INTERVAL_DAYS,
  NUMMUS_PROJECT_START_DATE
} from "../src/utils/constants.js";
import { dateRangeEveryDays, todayIsoDate } from "../src/utils/dates.js";
import { divideOrNull, round } from "../src/utils/math.js";
import type { CollectionWarning, GeneratedHistory, HistoryRecord } from "../src/utils/types.js";
import { collectHistoricalMarketPrice } from "./collectHistoricalMarketPrice.js";
import { coverageFor, readHistory, upsertRecords, writeHistory, HISTORY_PATH } from "./historyStore.js";

export async function backfillHistory(): Promise<GeneratedHistory> {
  const today = todayIsoDate();
  const dates = dateRangeEveryDays(NUMMUS_PROJECT_START_DATE, today, BACKFILL_INTERVAL_DAYS);
  const records: HistoryRecord[] = [];

  for (const date of dates) {
    const marketPrice = (await collectHistoricalMarketPrice(date))?.priceUsd ?? null;
    const vaultUsd = null;
    const supply = null;
    const nav = round(divideOrNull(vaultUsd, supply));
    const backing = round(
      nav !== null && marketPrice !== null && marketPrice !== 0 ? (nav / marketPrice) * 100 : null
    );
    const premium = round(
      marketPrice !== null && nav !== null && nav !== 0 ? marketPrice / nav : null
    );

    records.push({
      date,
      vaultUsd,
      supply,
      marketPrice,
      nav,
      backing,
      premium
    });
  }

  const existing = await readHistory();
  const preservedDailyRecords = (existing?.records ?? []).filter((record) => record.date >= today);
  const mergedRecords = upsertRecords(records, preservedDailyRecords);
  const warnings: CollectionWarning[] = [
    {
      metric: "history",
      message: `Backfill generated ${records.length} historical snapshot date(s) from ${NUMMUS_PROJECT_START_DATE} through yesterday using BACKFILL_INTERVAL_DAYS=${BACKFILL_INTERVAL_DAYS}.`
    },
    {
      metric: "vaultUsd",
      message:
        "Historical vaultUsd is not populated yet because the historical treasury balance replay layer is not implemented. The backfill does not reuse current vault balances for past dates."
    },
    {
      metric: "supply",
      message:
        "Historical supply is not populated yet because the mint/burn replay layer for NUMMUS supply is not implemented. The backfill does not reuse current token supply for past dates."
    },
    {
      metric: "marketPrice",
      message:
        "Historical market price is populated from DefiLlama Coins when available for the exact snapshot date. Missing dates remain null."
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    coverage: coverageFor(mergedRecords),
    warnings,
    vaultValuation: existing?.vaultValuation ?? null,
    burnEvents: existing?.burnEvents ?? [],
    records: mergedRecords
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const history = await backfillHistory();
  await writeHistory(history);
  console.log(`Backfilled ${history.records.length} total history records to ${HISTORY_PATH}`);
}
