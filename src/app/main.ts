import "./styles.css";
import { lineChart } from "../charts/lineChart.js";
import { kpi } from "../components/kpi.js";
import { latestRecord, loadHistory } from "../utils/history.js";
import { numberCompact, percent, ratio, usd } from "../utils/format.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

const root = app;

render().catch((error: unknown) => {
  root.innerHTML = `<div class="notice">${error instanceof Error ? error.message : "Unable to load dashboard"}</div>`;
});

async function render(): Promise<void> {
  const history = await loadHistory();
  const records = history.records;
  const latest = latestRecord(records);
  const unpricedCount = latest?.valuationReport?.unpricedAssets.length ?? 0;

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <strong>NUMMUS NAV Dashboard</strong>
          <span>Daily NAV, Treasury Backing, and Premium snapshots</span>
        </div>
        <span class="updated">${history.generatedAt ? `Updated ${new Date(history.generatedAt).toLocaleString()}` : "No snapshot collected yet"}</span>
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
          ${lineChart("NAV History", records, "nav")}
          ${lineChart("Treasury Backing History", records, "backing")}
          ${lineChart("Premium vs NAV History", records, "premium")}
          ${lineChart("Vault Value History", records, "vaultUsd")}
          ${lineChart("Supply History", records, "supply")}
        </section>
      </div>
    </div>
  `;
}
