import type { DailySnapshot } from "../utils/history.js";
import { usd, usdCompact } from "../utils/format.js";
import {
  applyZoomWindow,
  chartZoomControls,
  type ChartZoomWindow,
  type RangeKey
} from "./lineChart.js";

interface DexLiquidityChartOptions {
  records: DailySnapshot[];
  range: RangeKey;
  zoomWindow?: ChartZoomWindow;
}

interface LiquidityPool {
  pairAddress: string;
  dexId: string;
  pairLabel: string;
  liquidityUsd: number;
}

interface LiquidityRecord {
  date: string;
  totalLiquidityUsd: number;
  pools: LiquidityPool[];
}

interface PoolMeta {
  pairAddress: string;
  name: string;
  color: string;
  latestLiquidityUsd: number;
}

const WIDTH = 760;
const HEIGHT = 310;
const PAD = { top: 22, right: 22, bottom: 44, left: 82 };
const TOTAL_COLOR = "#57c990";
const POOL_COLORS = ["#d79551", "#68a7d8", "#c778c8", "#d6c45d", "#8b9ee8", "#d87575", "#74b9a5", "#b98cd9"];

export function dexLiquidityChart(options: DexLiquidityChartOptions): string {
  const allRecords = toLiquidityRecords(options.records);
  const rangedRecords = filterByRange(allRecords, options.range);
  const records = applyZoomWindow(rangedRecords, options.zoomWindow);
  if (records.length === 0) {
    return `<section class="chart"><h2>NUMMUS DEX Liquidity</h2><div class="empty">No detailed liquidity snapshots in selected range</div></section>`;
  }

  const poolMeta = buildPoolMeta(records);
  const xMin = dateTimestamp(records[0].date);
  const xMax = dateTimestamp(records.at(-1)?.date ?? records[0].date);
  const plotRight = WIDTH - PAD.right;
  const chartWidth = plotRight - PAD.left;
  const chartHeight = HEIGHT - PAD.top - PAD.bottom;
  const xForDate = (date: string) =>
    xMax === xMin
      ? PAD.left + chartWidth / 2
      : PAD.left + ((dateTimestamp(date) - xMin) / (xMax - xMin)) * chartWidth;

  const scale = makeLinearScale(records.map((record) => record.totalLiquidityUsd), chartHeight);
  const totalPoints = records.map((record) => ({
    x: xForDate(record.date),
    y: scale.y(record.totalLiquidityUsd),
    value: record.totalLiquidityUsd
  }));
  const totalPath = pathFor(totalPoints, plotRight);
  const totalAreaPath = `${totalPath} L ${plotRight} ${HEIGHT - PAD.bottom} L ${PAD.left} ${HEIGHT - PAD.bottom} Z`;
  const xTicks = makeDateTicks(records, responsiveTickCount());
  const latest = records.at(-1) as LiquidityRecord;
  const zoomed = Boolean(options.zoomWindow && (options.zoomWindow.start > 0 || options.zoomWindow.end < 1));

  return `
    <section class="chart liquidity-chart interactive-chart${zoomed ? " chart-zoomed" : ""}" data-chart-id="dex-liquidity">
      <div class="chart-head">
        <div>
          <div class="chart-title-row">
            <h2>NUMMUS DEX Liquidity</h2>
            ${infoTip("NUMMUS DEX Liquidity shows the combined USD liquidity reported across all tracked Solana pools containing NUMMUS. The chart uses a linear adaptive scale and displays Total Liquidity only; the pools tracked control lists the current value of every individual pool. Higher liquidity means more capital is deposited in pools, while Market Depth separately measures executable trade size.")}
            <a class="chart-action" href="https://dexscreener.com/solana/9JK2U7aEkp3tWaFNuaJowWRgNys5DVaKGxWk73VT5ray" target="_blank" rel="noreferrer">DexScreener</a>
            ${chartZoomControls("dex-liquidity", options.zoomWindow)}
          </div>
          <span>${formatDate(records[0].date)} -> ${formatDate(latest.date)}</span>
        </div>
        <div class="chart-current">
          <strong>${usd(latest.totalLiquidityUsd)}</strong>
          ${changeSummary(records)}
        </div>
      </div>
      <div class="liquidity-toolbar">
        <span class="liquidity-toolbar-labels">
          <span class="liquidity-log-label">Linear scale</span>
          <span class="liquidity-total-key"><i></i>Total</span>
        </span>
        ${poolSummary(poolMeta)}
      </div>
      <div class="chart-canvas">
        <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="NUMMUS DEX Liquidity by pool">
          <text class="axis-title y-axis-title" x="${PAD.left}" y="${PAD.top - 8}">Total DEX Liquidity (USD)</text>
          <text class="axis-title x-axis-title" x="${plotRight}" y="${HEIGHT - 7}" text-anchor="end">Date</text>
          ${scale.ticks.map((tick) => {
            const y = scale.y(tick);
            return `<line class="grid-line" x1="${PAD.left}" y1="${y}" x2="${plotRight}" y2="${y}" /><text class="tick-label y-tick" x="${PAD.left - 10}" y="${y + 4}" text-anchor="end">${usdCompact(tick)}</text>`;
          }).join("")}
          ${xTicks.map((tick) => {
            const x = xForDate(tick.date);
            return `<line class="x-grid-line" x1="${x}" y1="${PAD.top}" x2="${x}" y2="${HEIGHT - PAD.bottom}" /><line class="x-tick-line" x1="${x}" y1="${HEIGHT - PAD.bottom}" x2="${x}" y2="${HEIGHT - PAD.bottom + 5}" /><text class="tick-label x-tick" x="${x}" y="${HEIGHT - 18}" text-anchor="middle">${formatDate(tick.date)}</text>`;
          }).join("")}
          <line class="axis-line" x1="${PAD.left}" y1="${HEIGHT - PAD.bottom}" x2="${plotRight}" y2="${HEIGHT - PAD.bottom}" />
          <line class="axis-line" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" />
          <path class="area-path liquidity-total-area" d="${totalAreaPath}" />
          <path class="liquidity-total-path" d="${totalPath}" />
          <line class="crosshair" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" />
          <circle class="hover-dot liquidity-hover-dot" cx="${totalPoints[0].x}" cy="${totalPoints[0].y}" r="5" />
          <rect class="hover-capture" x="${PAD.left}" y="${PAD.top}" width="${chartWidth}" height="${chartHeight}" />
        </svg>
        <div class="chart-tooltip liquidity-tooltip"></div>
      </div>
      <script type="application/json" class="chart-data">${serializeJson({
        points: records.map((record, index) => ({
          date: record.date,
          dateLabel: formatDate(record.date),
          value: record.totalLiquidityUsd,
          label: usd(record.totalLiquidityUsd),
          x: totalPoints[index].x,
          y: totalPoints[index].y,
          series: [
            { name: "Total Liquidity", label: usd(record.totalLiquidityUsd), kind: "neutral", color: TOTAL_COLOR }
          ]
        }))
      })}</script>
    </section>
  `;
}

function toLiquidityRecords(records: DailySnapshot[]): LiquidityRecord[] {
  return records.flatMap((record) => {
    const liquidity = record.dexLiquidity;
    if (typeof liquidity?.totalLiquidityUsd !== "number" || !liquidity.pools?.length) return [];
    return [{
      date: record.date,
      totalLiquidityUsd: liquidity.totalLiquidityUsd,
      pools: liquidity.pools.filter((pool) => Number.isFinite(pool.liquidityUsd) && pool.liquidityUsd >= 0)
    }];
  });
}

function buildPoolMeta(records: LiquidityRecord[]): PoolMeta[] {
  const latestByAddress = new Map<string, LiquidityPool>();
  const maxByAddress = new Map<string, number>();
  for (const record of records) {
    for (const pool of record.pools) {
      latestByAddress.set(pool.pairAddress, pool);
      maxByAddress.set(pool.pairAddress, Math.max(maxByAddress.get(pool.pairAddress) ?? 0, pool.liquidityUsd));
    }
  }
  const pools = [...latestByAddress.values()];
  const labelCounts = new Map<string, number>();
  for (const pool of pools) {
    const key = `${pool.dexId}:${pool.pairLabel}`;
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }

  return pools
    .sort((a, b) => (maxByAddress.get(b.pairAddress) ?? 0) - (maxByAddress.get(a.pairAddress) ?? 0))
    .map((pool, index) => ({
      pairAddress: pool.pairAddress,
      name: `${titleCase(pool.dexId)} · ${pool.pairLabel}${(labelCounts.get(`${pool.dexId}:${pool.pairLabel}`) ?? 0) > 1 ? ` · ${pool.pairAddress.slice(0, 4)}` : ""}`,
      color: POOL_COLORS[index % POOL_COLORS.length],
      latestLiquidityUsd: pool.liquidityUsd
    }));
}

function makeLinearScale(values: number[], chartHeight: number): { y: (value: number) => number; ticks: number[] } {
  const observedMax = Math.max(...values, 1);
  const max = niceLinearMax(observedMax * 1.25);
  const ticks = Array.from({ length: 5 }, (_, index) => max * index / 4);
  return {
    y: (value) => PAD.top + (1 - Math.max(0, value) / max) * chartHeight,
    ticks
  };
}

function niceLinearMax(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, value)));
  const normalized = value / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 1.5 ? 1.5 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function pathFor(points: Array<{ x: number; y: number | null; value: number }>, plotRight: number): string {
  if (points.length === 1 && points[0].y !== null) {
    return `M ${PAD.left} ${points[0].y.toFixed(2)} L ${plotRight} ${points[0].y.toFixed(2)}`;
  }
  let connected = false;
  return points.map((point) => {
    if (point.y === null) {
      connected = false;
      return "";
    }
    const command = connected ? "L" : "M";
    connected = true;
    return `${command} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(" ");
}

function filterByRange(records: LiquidityRecord[], range: RangeKey): LiquidityRecord[] {
  if (range === "ALL" || records.length === 0) return records;
  const last = dateTimestamp(records.at(-1)?.date ?? records[0].date);
  const days = range === "1D" ? 1 : range === "7D" ? 7 : range === "30D" ? 30 : 365;
  const cutoff = last - days * 86_400_000;
  return records.filter((record) => dateTimestamp(record.date) >= cutoff);
}

function makeDateTicks(records: LiquidityRecord[], maxCount: number): Array<{ date: string }> {
  const start = dateTimestamp(records[0].date);
  const end = dateTimestamp(records.at(-1)?.date ?? records[0].date);
  const visibleDays = Math.max(1, Math.round((end - start) / 86_400_000));
  const count = Math.max(2, Math.min(maxCount, visibleDays + 1));
  return Array.from({ length: count }, (_, index) => ({
    date: new Date(start + ((end - start) * index) / Math.max(1, count - 1)).toISOString().slice(0, 10)
  }));
}

function changeSummary(records: LiquidityRecord[]): string {
  if (records.length < 2) return `<span class="chart-change neutral">N/A for range</span>`;
  const first = records[0].totalLiquidityUsd;
  const last = records.at(-1)?.totalLiquidityUsd ?? first;
  if (first === 0) return `<span class="chart-change neutral">N/A for range</span>`;
  const change = ((last - first) / Math.abs(first)) * 100;
  const direction = change > 0 ? "↑" : change < 0 ? "↓" : "→";
  const state = change > 0 ? "favorable" : change < 0 ? "adverse" : "neutral";
  return `<span class="chart-change ${state}">${direction} ${change > 0 ? "+" : ""}${change.toFixed(2)}%</span>`;
}

function poolSummary(pools: PoolMeta[]): string {
  const totalLiquidityUsd = pools.reduce((sum, pool) => sum + pool.latestLiquidityUsd, 0);
  return `
    <span class="liquidity-pools-trigger" tabindex="0" aria-label="Show latest liquidity for ${pools.length} tracked pools">
      ${pools.length} pools tracked <i>i</i>
      <span class="liquidity-pools-popover" role="tooltip">
        <strong>Latest pool liquidity</strong>
        <span class="liquidity-pool-row liquidity-pool-total"><i style="background:${TOTAL_COLOR}"></i><em>Total Liquidity</em><b>${usd(totalLiquidityUsd)}</b></span>
        ${pools.map((pool) => `<span class="liquidity-pool-row"><i style="background:${pool.color}"></i><em>${escapeHtml(pool.name)}</em><b>${usd(pool.latestLiquidityUsd)}</b></span>`).join("")}
      </span>
    </span>
  `;
}

function infoTip(text: string): string {
  return `<span class="info-tip" tabindex="0" aria-label="${escapeHtml(text)}">i<span class="info-popover" role="tooltip">${escapeHtml(text)}</span></span>`;
}

function responsiveTickCount(): number {
  return typeof window !== "undefined" && window.innerWidth <= 620 ? 4 : 8;
}

function dateTimestamp(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getTime();
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year.slice(2)}`;
}

function titleCase(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "Unknown";
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
}
