import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectBurnHistory } from "./collectBurnHistory.js";
import { collectPriceHistory } from "./collectPriceHistory.js";
import { collectSupplyHistory } from "./collectSupplyHistory.js";
import { collectVaultHistory } from "./collectVaultHistory.js";
import { divideOrNull, round } from "../src/utils/math.js";
import type { CollectionWarning, GeneratedHistory, HistoryRecord } from "../src/utils/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = resolve(__dirname, "../data/history.json");

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
  for (const event of burnResult.data) dates.add(event.date);

  const records: HistoryRecord[] = [...dates].sort().map((date) => {
    const vaultUsd = vaultResult.data.find((snapshot) => snapshot.date === date)?.vaultUsd ?? null;
    const supply = supplyResult.data.find((snapshot) => snapshot.date === date)?.uiAmount ?? null;
    const marketPrice =
      priceResult.data.find((snapshot) => snapshot.date === date)?.priceUsd ?? null;
    const burned = burnResult.data
      .filter((event) => event.date === date)
      .reduce((total, event) => total + event.amount, 0);

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
      premium,
      burned: burned > 0 ? round(burned, 6) : null
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

  return {
    generatedAt: new Date().toISOString(),
    coverage: {
      from: records[0]?.date ?? null,
      to: records.at(-1)?.date ?? null,
      recordCount: records.length
    },
    warnings,
    records
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const history = await buildHistory();
  await mkdir(dirname(HISTORY_PATH), { recursive: true });
  await writeFile(`${HISTORY_PATH}`, `${JSON.stringify(history, null, 2)}\n`);
  console.log(`Wrote ${history.records.length} history records to ${HISTORY_PATH}`);
}
