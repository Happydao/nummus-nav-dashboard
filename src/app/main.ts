import "./styles.css";
import { attachChartInteractions } from "../charts/interactions.js";
import { lineChart, rangeButtons, type RangeKey } from "../charts/lineChart.js";
import { kpi } from "../components/kpi.js";
import { latestRecord, loadHistory, type DailySnapshot, type SupplySnapshot } from "../utils/history.js";
import { numberCompact, percent, ratio, tbtcAxis, usd, usdCompact } from "../utils/format.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

const root = app;
let selectedRange: RangeKey = "30D";

render().catch((error: unknown) => {
  root.innerHTML = `<div class="notice">${error instanceof Error ? error.message : "Unable to load dashboard"}</div>`;
});

async function render(): Promise<void> {
  const history = await loadHistory();
  const records = history.records;
  const tbtcHistory = history.tbtcHistory ?? [];
  const supplyChartRecords = buildSupplyChartRecords(history.supplyHistory ?? [], records);
  const latest = latestRecord(records);
  const unpricedCount = latest?.valuationReport?.unpricedAssets.length ?? 0;
  const vaultComposition = latest ? vaultCompositionDetails(latest) : "";

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <strong>NUMMUS NAV Dashboard</strong>
          <span>Daily NAV, Treasury Backing, and Premium snapshots. Updated once per day at 06:00 UTC.</span>
        </div>
        <div class="topbar-tools">
          ${rangeButtons(selectedRange)}
          <span class="updated">${history.generatedAt ? `Updated ${new Date(history.generatedAt).toLocaleString()}` : "No snapshot collected yet"}</span>
        </div>
      </header>
      <div class="content">
        <section class="kpis">
          ${kpi("Vault Value", usd(latest?.vaultUsd ?? null), vaultComposition)}
          ${kpi("NAV", usd(latest?.nav ?? null))}
          ${kpi("Treasury Backing", percent(latest?.backing ?? null))}
          ${kpi("Premium vs NAV", ratio(latest?.premium ?? null))}
          ${kpi("Current Supply", numberCompact(latest?.supply ?? null))}
          ${kpi("Market Price", usd(latest?.marketPrice ?? null))}
        </section>
        ${
          unpricedCount > 0
            ? `<div class="notice">${unpricedCount} fungible vault asset(s) could not be priced. Vault Value and derived metrics are left blank for the latest snapshot.</div>`
            : ""
        }
        <section class="charts">
          ${lineChart({
            id: "nav",
            title: "NAV History",
            records,
            key: "nav",
            range: selectedRange,
            formatter: usd,
            axisFormatter: usd,
            yLabel: "USD / NUMMUS",
            yMin: 0,
            info: "Net asset value per NUMMUS token. Calculated as Vault Value divided by circulating supply."
          })}
          ${lineChart({
            id: "backing",
            title: "Treasury Backing History",
            records,
            key: "backing",
            range: selectedRange,
            formatter: percent,
            axisFormatter: percent,
            yLabel: "Backing %",
            yMin: 0,
            info: "Treasury backing compares NAV with the market price. 100% means NAV equals market price."
          })}
          ${lineChart({
            id: "premium",
            title: "Premium vs NAV History",
            records,
            key: "premium",
            range: selectedRange,
            formatter: ratio,
            axisFormatter: ratio,
            yLabel: "Market / NAV",
            yMin: 0,
            info: "Premium vs NAV shows how many times market price trades above or below NAV."
          })}
          ${lineChart({
            id: "vault",
            title: "Vault Value History",
            records,
            key: "vaultUsd",
            range: selectedRange,
            formatter: usd,
            axisFormatter: usdCompact,
            yLabel: "USD",
            yMin: 0,
            info: "Total USD value of fungible assets counted for the NUMMUS treasury snapshot. NFTs are ignored."
          })}
          ${lineChart({
            id: "supply",
            title: "Supply History",
            records: supplyChartRecords,
            key: "supply",
            range: selectedRange,
            formatter: numberCompact,
            axisFormatter: numberCompact,
            yLabel: "NUMMUS",
            yMin: 80_000_000,
            yMax: 100_000_000,
            showMarkers: true,
            info: "NUMMUS circulating supply over time. Historical points come from supply reconstruction; new points come from daily snapshots."
          })}
          ${lineChart({
            id: "tbtc",
            title: "tBTC Accumulation",
            records: tbtcHistory,
            key: "amount",
            range: selectedRange,
            formatter: (value) => `${value.toFixed(8)} tBTC`,
            axisFormatter: tbtcAxis,
            yLabel: "tBTC",
            yMin: 0,
            showMarkers: true,
            includePreviousPoint: true,
            info: "tBTC accumulated by the vault wallet over time, displayed as token amount rather than USD value."
          })}
        </section>
      </div>
    </div>
  `;
  attachRangeHandlers();
  attachChartInteractions(root);
}

function vaultCompositionDetails(record: DailySnapshot): string {
  const assets = (record.valuationReport?.pricedAssets ?? []) as Array<{
    symbol?: string | null;
    mint?: string;
    valueUsd?: number;
  }>;
  const rows = assets
    .filter((asset) => typeof asset.valueUsd === "number" && asset.valueUsd > 0)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .map(
      (asset) => `
        <li>
          <span>${escapeHtml(asset.symbol ?? shortMint(asset.mint ?? ""))}</span>
          <strong>${usd(asset.valueUsd ?? null)}</strong>
        </li>
      `
    )
    .join("");

  if (!rows) return "";

  return `
    <div class="kpi-breakdown" aria-label="Vault asset composition">
      <small>Latest composition</small>
      <ul>${rows}</ul>
    </div>
  `;
}

function shortMint(mint: string): string {
  return mint ? `${mint.slice(0, 4)}...${mint.slice(-4)}` : "Asset";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildSupplyChartRecords(supplyHistory: SupplySnapshot[], records: DailySnapshot[]): SupplySnapshot[] {
  const byDate = new Map<string, SupplySnapshot>();

  for (const snapshot of supplyHistory) {
    byDate.set(snapshot.date, snapshot);
  }

  for (const record of records) {
    if (typeof record.supply !== "number") continue;
    byDate.set(record.date, {
      date: record.date,
      supply: record.supply
    });
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function attachRangeHandlers(): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-range]")) {
    button.addEventListener("click", () => {
      selectedRange = button.dataset.range as RangeKey;
      render().catch((error: unknown) => {
        root.innerHTML = `<div class="notice">${error instanceof Error ? error.message : "Unable to load dashboard"}</div>`;
      });
    });
  }
}
