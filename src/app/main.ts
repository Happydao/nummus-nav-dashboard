import "./styles.css";
import { attachChartInteractions } from "../charts/interactions.js";
import { lineChart, rangeButtons, type RangeKey } from "../charts/lineChart.js";
import { kpi } from "../components/kpi.js";
import { latestRecord, loadHistory, type DailySnapshot, type SupplySnapshot } from "../utils/history.js";
import { numberCompact, percent, ratio, tbtcAxis, usd, usdCompact } from "../utils/format.js";

const app = document.querySelector<HTMLDivElement>("#app");
const NUMMUS_MINT_URL = "https://solscan.io/token/9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray";
const REALMS_DAO_URL = "https://app.realms.today/dao/2Czvw7p29thfqNJznuicygBKxh33xoCMuGMH7zbPQ2gp";
const VAULT_SOLSCAN_URL = "https://solscan.io/account/HtT3yMsAavLQYmd6VSbXSdbAefyZUrrFeEPoTPivde3s";
const NUMMUS_COINGECKO_URL = "https://www.coingecko.com/en/coins/nummus-aeternitas";

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
          ${kpi(
            "Nummus Aeternitas Vault DAO",
            usd(latest?.vaultUsd ?? null),
            `${externalLinks([
              ["Realms DAO", REALMS_DAO_URL],
              ["Vault Solscan", VAULT_SOLSCAN_URL]
            ])}${vaultComposition}`
          )}
          ${kpi("NAV", usd(latest?.nav ?? null))}
          ${kpi("Treasury Backing", percent(latest?.backing ?? null))}
          ${kpi("Premium vs NAV", ratio(latest?.premium ?? null))}
          ${kpi("NUMMUS Supply", numberCompact(latest?.supply ?? null), externalLinks([["Mint Solscan", NUMMUS_MINT_URL]]))}
          ${kpi("NUMMUS Price", usd(latest?.marketPrice ?? null), externalLinks([["CoinGecko", NUMMUS_COINGECKO_URL]]))}
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
            info: "NAV is the treasury value behind each NUMMUS token. It is better when NAV is close to the market price, because that means the token price is aligned with treasury backing."
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
            info: "Treasury backing compares NAV with market price. 100% means the market price is fully backed by NAV; below 100% means the token trades above its backing; above 100% means NAV is higher than market price."
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
            info: "Premium shows how many times market price is above NAV. Lower is generally healthier; 1x means price equals NAV, while high values mean the token is trading at a large premium."
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
            info: "Vault Value is the total USD value of fungible treasury assets counted in the snapshot. Higher value means a larger treasury. NFTs and tiny spam assets are ignored."
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
            yMin: 90_000_000,
            yMax: 100_000_000,
            showMarkers: true,
            info: "Supply shows how many NUMMUS tokens are circulating. Lower supply can increase NAV per token if treasury value is stable or growing."
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
            info: "tBTC Accumulation shows how much tBTC the treasury has collected. A rising line means the treasury is accumulating more BTC exposure."
          })}
        </section>
      </div>
    </div>
  `;
  attachRangeHandlers();
  attachChartInteractions(root);
}

function vaultCompositionDetails(record: DailySnapshot): string {
  const minDisplayValueUsd = 20;
  const assets = (record.valuationReport?.pricedAssets ?? []) as Array<{
    symbol?: string | null;
    mint?: string;
    amount?: number;
    valueUsd?: number;
  }>;
  const rows = assets
    .filter((asset) => typeof asset.valueUsd === "number" && asset.valueUsd >= minDisplayValueUsd)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
    .map(
      (asset) => `
        <li>
          <span>
            ${escapeHtml(asset.symbol ?? shortMint(asset.mint ?? ""))}
            <small>${formatAssetAmount(asset.amount)}</small>
          </span>
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

function externalLinks(links: Array<[string, string]>): string {
  return `
    <div class="kpi-links">
      ${links
        .map(
          ([label, href]) =>
            `<a href="${href}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`
        )
        .join("")}
    </div>
  `;
}

function formatAssetAmount(amount: number | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: amount >= 1 ? 2 : 8
  }).format(amount);
  return formatted;
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
    if (record.valuationReport?.source?.startsWith("Imported from Nummus.VaultDAO")) continue;
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
