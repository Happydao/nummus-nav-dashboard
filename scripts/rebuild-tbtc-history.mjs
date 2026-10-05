import { readdir, readFile, writeFile } from "node:fs/promises";

const TBTC_MINT = "6DNSN2BJsaPFdFFc1zP37kkeNe4Usc1Sqkzr9C9vPWcU";

function normalizeRecord(record) {
  const tbtc = (record.valuationReport?.pricedAssets ?? []).find((asset) => asset.mint === TBTC_MINT);
  const amount = Number.isFinite(record.tbtcAmount) ? record.tbtcAmount : tbtc?.amount;
  const priceUsd = tbtc?.priceUsd;
  const hasValue = Number.isFinite(amount) && Number.isFinite(priceUsd) && amount >= 0 && priceUsd > 0;
  const valuedTbtc = tbtc && hasValue
    ? { ...tbtc, symbol: "tBTC", amount, priceUsd, valueUsd: amount * priceUsd }
    : null;

  return {
    ...record,
    vaultUsd: valuedTbtc ? valuedTbtc.valueUsd : null,
    tbtcAmount: Number.isFinite(amount) ? amount : null,
    valuationReport: {
      ...record.valuationReport,
      pricedAssets: valuedTbtc ? [valuedTbtc] : [],
      ignoredAssets: [],
      unpricedAssets: []
    }
  };
}

const historyPath = "data/history.json";
const history = JSON.parse(await readFile(historyPath, "utf8"));
history.records = history.records.map(normalizeRecord);
history.generatedAt = new Date().toISOString();
await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);

const snapshotNames = (await readdir("data/snapshots")).filter((name) => name.endsWith(".json"));
for (const name of snapshotNames) {
  const path = `data/snapshots/${name}`;
  const snapshot = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, `${JSON.stringify(normalizeRecord(snapshot), null, 2)}\n`);
}

console.log(`Rebuilt ${history.records.length} history records and ${snapshotNames.length} daily snapshots using tBTC only.`);
