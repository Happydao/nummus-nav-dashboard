import "./styles.css";
import { attachChartInteractions } from "../charts/interactions.js";
import { lineChart, rangeButtons, type RangeKey } from "../charts/lineChart.js";
import { kpi } from "../components/kpi.js";
import { latestRecord, loadHistory } from "../utils/history.js";
import { numberCompact, percent, ratio, usd } from "../utils/format.js";

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
  const latest = latestRecord(records);
  const unpricedCount = latest?.valuationReport?.unpricedAssets.length ?? 0;

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
          ${kpi("Vault Value", usd(latest?.vaultUsd ?? null))}
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
            yLabel: "USD / NUMMUS",
            yMin: 0
          })}
          ${lineChart({
            id: "backing",
            title: "Treasury Backing History",
            records,
            key: "backing",
            range: selectedRange,
            formatter: percent,
            yLabel: "Backing %",
            yMin: 0
          })}
          ${lineChart({
            id: "premium",
            title: "Premium vs NAV History",
            records,
            key: "premium",
            range: selectedRange,
            formatter: ratio,
            yLabel: "Market / NAV",
            yMin: 0
          })}
          ${lineChart({
            id: "vault",
            title: "Vault Value History",
            records,
            key: "vaultUsd",
            range: selectedRange,
            formatter: usd,
            yLabel: "USD",
            yMin: 0
          })}
          ${lineChart({
            id: "supply",
            title: "Supply History",
            records,
            key: "supply",
            range: selectedRange,
            formatter: numberCompact,
            yLabel: "NUMMUS Supply",
            yMin: 0,
            yMax: 100_000_000
          })}
          ${lineChart({
            id: "tbtc",
            title: "tBTC Accumulation",
            records: tbtcHistory,
            key: "amount",
            range: selectedRange,
            formatter: (value) => `${value.toFixed(8)} tBTC`,
            yLabel: "tBTC",
            yMin: 0,
            showMarkers: true,
            includePreviousPoint: true
          })}
        </section>
      </div>
    </div>
  `;
  attachRangeHandlers();
  attachChartInteractions(root);
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
