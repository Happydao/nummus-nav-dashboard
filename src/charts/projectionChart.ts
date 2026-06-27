import type { DailySnapshot, SupplySnapshot } from "../utils/history.js";
import { numberCompact, ratio, usd, usdCompact } from "../utils/format.js";

export type ProjectionScenario = "steady" | "strong" | "accelerated";
export type ProjectionYears = 1 | 2 | 3 | 5;

interface ProjectionChartOptions {
  latest: DailySnapshot | null;
  records: DailySnapshot[];
  supplyHistory: SupplySnapshot[];
  scenario: ProjectionScenario;
  years: ProjectionYears;
}

interface ProjectionPoint {
  date: string;
  dateLabel: string;
  vaultUsd: number;
  supply: number;
  burned: number;
  nav: number;
  impliedPrice: number;
  x: number;
  vaultY: number;
  priceY: number;
}

const SCENARIOS: Record<ProjectionScenario, { label: string; targetMultiplier: number; premiumBasis: string }> = {
  steady: { label: "Steady", targetMultiplier: 5, premiumBasis: "historical minimum" },
  strong: { label: "Strong", targetMultiplier: 10, premiumBasis: "historical average" },
  accelerated: { label: "Accelerated", targetMultiplier: 20, premiumBasis: "historical maximum" }
};

const WIDTH = 1000;
const HEIGHT = 390;
const PAD = { top: 28, right: 112, bottom: 48, left: 112 };
const INFO =
  "This simulator starts from the latest real Vault Value and supply. The selected scenario sets the Vault Value target at year five: Steady 5x, Strong 10x, or Accelerated 20x today's Vault. Values between today and year five are interpolated linearly, so every horizon follows the same trajectory. Supply decreases using the average daily burn observed between the first reliable supply point and today. Projected NAV equals projected Vault Value divided by projected supply. For every valid historical day, premium equals NUMMUS market price divided by NAV. Steady uses the lowest historical premium, Strong uses the arithmetic average, and Accelerated uses the highest historical premium. Projected NUMMUS Price equals projected NAV multiplied by the selected scenario premium. These are mathematical scenarios, not guaranteed market forecasts or financial advice.";

export function projectionChart(options: ProjectionChartOptions): string {
  const latest = options.latest;
  if (
    !latest ||
    latest.vaultUsd === null ||
    latest.supply === null ||
    latest.nav === null ||
    latest.marketPrice === null ||
    latest.nav <= 0 ||
    latest.supply <= 0
  ) {
    return `
      <section class="chart chart-full projection-section">
        <h2>Treasury Growth &amp; Projected NUMMUS Price Simulator</h2>
        <div class="empty">A complete current snapshot is required for projections</div>
      </section>
    `;
  }

  const burnRate = observedBurnRate(options.supplyHistory, latest);
  const scenario = SCENARIOS[options.scenario];
  const premium = scenarioPremium(options.records, options.scenario) ?? latest.marketPrice / latest.nav;
  const totalMonths = options.years * 12;
  const rawPoints = Array.from({ length: totalMonths + 1 }, (_, month) => {
    const date = addUtcMonths(latest.date, month);
    const elapsedDays = daysBetween(latest.date, date);
    const vaultMultiplier = 1 + (scenario.targetMultiplier - 1) * (month / 60);
    const vaultUsd = latest.vaultUsd as number * vaultMultiplier;
    const supply = Math.max(1, (latest.supply as number) - burnRate.perDay * elapsedDays);
    const nav = vaultUsd / supply;
    return {
      date,
      dateLabel: month === 0 ? "Today" : formatProjectionDate(date),
      vaultUsd,
      supply,
      burned: (latest.supply as number) - supply,
      nav,
      impliedPrice: nav * premium
    };
  });

  const vaultMax = niceCeil(Math.max(...rawPoints.map((point) => point.vaultUsd)));
  const priceMax = niceCeil(Math.max(...rawPoints.map((point) => point.impliedPrice)));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const points: ProjectionPoint[] = rawPoints.map((point, index) => {
    const x = PAD.left + (index / totalMonths) * plotWidth;
    return {
      ...point,
      x,
      vaultY: PAD.top + (1 - point.vaultUsd / vaultMax) * plotHeight,
      priceY: PAD.top + (1 - point.impliedPrice / priceMax) * plotHeight
    };
  });
  const endpoint = points.at(-1) as ProjectionPoint;
  const vaultTicks = makeTicks(0, vaultMax, 5);
  const priceTicks = makeTicks(0, priceMax, 5);
  const timeTicks = makeTimeTicks(points, options.years);

  return `
    <section class="chart chart-full projection-section interactive-chart" data-chart-id="projection">
      <div class="projection-head">
        <div>
          <div class="chart-title-row">
            <h2>Treasury Growth &amp; Projected NUMMUS Price Simulator</h2>
            ${infoTip(INFO)}
          </div>
          <span>${scenario.label} scenario · ${scenario.targetMultiplier}x Vault target at 5Y · ${options.years}Y view</span>
        </div>
        <div class="projection-controls">
          ${scenarioButtons(options.scenario)}
          ${horizonButtons(options.years)}
        </div>
      </div>

      <div class="projection-stats">
        ${stat("Projected Vault", usd(endpoint.vaultUsd), "projection-stat-vault")}
        ${stat("Projected Supply", numberCompact(endpoint.supply))}
        ${stat("Projected Burns", numberCompact(endpoint.burned))}
        ${stat("Projected NAV", usd(endpoint.nav))}
        ${stat("Projected NUMMUS Price", usd(endpoint.impliedPrice), "projection-stat-price")}
        ${stat("Scenario Premium", ratio(premium))}
      </div>

      <div class="projection-assumptions">
        <span>Observed burn pace: ${numberCompact(burnRate.perYear)} NUMMUS/year</span>
        <span>Premium basis: ${scenario.premiumBasis}</span>
        <span>Projection endpoint: ${formatProjectionDate(endpoint.date)}</span>
      </div>

      <div class="chart-legend projection-legend" aria-label="Projection legend">
        <span><i class="legend-swatch projection-vault"></i>Vault Value (USD)</span>
        <span><i class="legend-swatch projection-price"></i>Projected NUMMUS Price (USD)</span>
      </div>

      <div class="chart-canvas projection-canvas">
        <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Projected Vault Value and projected NUMMUS price">
          <text class="axis-title projection-vault-axis" x="${PAD.left}" y="${PAD.top - 10}">Vault Value (USD)</text>
          <text class="axis-title projection-price-axis" x="${WIDTH - 4}" y="${PAD.top - 10}" text-anchor="end">Projected NUMMUS Price (USD)</text>
          ${vaultTicks
            .map((tick, index) => {
              const y = PAD.top + (1 - tick / vaultMax) * plotHeight;
              return `
                <line class="grid-line" x1="${PAD.left}" y1="${y}" x2="${WIDTH - PAD.right}" y2="${y}" />
                <text class="tick-label projection-vault-tick" x="${PAD.left - 10}" y="${y + 4}" text-anchor="end">${usdCompact(tick)}</text>
                <text class="tick-label projection-price-tick" x="${WIDTH - PAD.right + 10}" y="${y + 4}" text-anchor="start">${usd(priceTicks[index])}</text>
              `;
            })
            .join("")}
          ${timeTicks
            .map(
              (tick) => `
                <line class="x-tick-line" x1="${tick.x}" y1="${HEIGHT - PAD.bottom}" x2="${tick.x}" y2="${HEIGHT - PAD.bottom + 5}" />
                <text class="tick-label x-tick" x="${tick.x}" y="${HEIGHT - 17}" text-anchor="middle">${tick.label}</text>
              `
            )
            .join("")}
          <line class="axis-line projection-vault-axis-line" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" />
          <line class="axis-line projection-price-axis-line" x1="${WIDTH - PAD.right}" y1="${PAD.top}" x2="${WIDTH - PAD.right}" y2="${HEIGHT - PAD.bottom}" />
          <line class="axis-line" x1="${PAD.left}" y1="${HEIGHT - PAD.bottom}" x2="${WIDTH - PAD.right}" y2="${HEIGHT - PAD.bottom}" />
          <path class="projection-path projection-vault-path" d="${makePath(points, "vaultY")}" />
          <path class="projection-path projection-price-path" d="${makePath(points, "priceY")}" />
          <line class="crosshair" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" />
          <circle class="hover-dot" cx="${points[0].x}" cy="${points[0].vaultY}" r="5" />
          <rect class="hover-capture" x="${PAD.left}" y="${PAD.top}" width="${plotWidth}" height="${plotHeight}" />
        </svg>
        <div class="chart-tooltip"></div>
      </div>
      <script type="application/json" class="chart-data">${JSON.stringify({
        points: points.map((point) => ({
          date: point.date,
          dateLabel: point.dateLabel,
          value: point.vaultUsd,
          x: point.x,
          y: point.vaultY,
          label: usd(point.vaultUsd),
          series: [
            { name: "Vault Value", label: usd(point.vaultUsd), kind: "primary" },
            { name: "Projected NUMMUS Price", label: usd(point.impliedPrice), kind: "secondary" },
            { name: "Supply", label: numberCompact(point.supply), kind: "neutral" },
            { name: "Projected Burns", label: numberCompact(point.burned), kind: "neutral" },
            { name: "NAV", label: usd(point.nav), kind: "neutral" }
          ]
        }))
      })}</script>
    </section>
  `;
}

function observedBurnRate(history: SupplySnapshot[], latest: DailySnapshot): { perDay: number; perYear: number } {
  const first = [...history]
    .filter((point) => Number.isFinite(point.supply) && point.date < latest.date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!first || latest.supply === null) return { perDay: 0, perYear: 0 };
  const elapsedDays = daysBetween(first.date, latest.date);
  if (elapsedDays <= 0) return { perDay: 0, perYear: 0 };
  const perDay = Math.max(0, first.supply - latest.supply) / elapsedDays;
  return { perDay, perYear: perDay * 365.25 };
}

function scenarioPremium(records: DailySnapshot[], scenario: ProjectionScenario): number | null {
  const premiums = records
    .map((record) => record.premium)
    .filter((premium): premium is number => typeof premium === "number" && Number.isFinite(premium) && premium > 0);
  if (premiums.length === 0) return null;
  if (scenario === "steady") return Math.min(...premiums);
  if (scenario === "accelerated") return Math.max(...premiums);
  return premiums.reduce((total, premium) => total + premium, 0) / premiums.length;
}

function scenarioButtons(selected: ProjectionScenario): string {
  return `
    <div class="projection-selector" aria-label="Projection scenario">
      ${(Object.entries(SCENARIOS) as Array<[ProjectionScenario, (typeof SCENARIOS)[ProjectionScenario]]>)
        .map(
          ([key, scenario]) =>
            `<button type="button" data-projection-scenario="${key}" class="${key === selected ? "active" : ""}">${scenario.label} ${scenario.targetMultiplier}x</button>`
        )
        .join("")}
    </div>
  `;
}

function horizonButtons(selected: ProjectionYears): string {
  const years: ProjectionYears[] = [1, 2, 3, 5];
  return `
    <div class="projection-selector horizon-selector" aria-label="Projection horizon">
      ${years
        .map(
          (year) =>
            `<button type="button" data-projection-years="${year}" class="${year === selected ? "active" : ""}">${year}Y</button>`
        )
        .join("")}
    </div>
  `;
}

function stat(label: string, value: string, className = ""): string {
  return `<div class="${className}"><span>${label}</span><strong>${value}</strong></div>`;
}

function infoTip(text: string): string {
  return `
    <span class="info-tip" tabindex="0" aria-label="${escapeHtml(text)}">
      i
      <span class="info-popover" role="tooltip">${escapeHtml(text)}</span>
    </span>
  `;
}

function addUtcMonths(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.max(
    0,
    (new Date(`${end}T00:00:00.000Z`).getTime() - new Date(`${start}T00:00:00.000Z`).getTime()) /
      86_400_000
  );
}

function formatProjectionDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00.000Z`)
  );
}

function makePath(points: ProjectionPoint[], key: "vaultY" | "priceY"): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point[key].toFixed(2)}`)
    .join(" ");
}

function makeTicks(min: number, max: number, count: number): number[] {
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function makeTimeTicks(points: ProjectionPoint[], years: number): Array<{ x: number; label: string }> {
  const indexes = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round((points.length - 1) * ratio));
  return [...new Set(indexes)].map((index) => ({
    x: points[index].x,
    label: index === 0 ? "Today" : formatHorizonMonth(index)
  }));
}

function formatHorizonMonth(month: number): string {
  if (month < 12) return `${month}M`;
  if (month % 12 === 0) return `${month / 12}Y`;
  return `${(month / 12).toFixed(1)}Y`;
}

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
