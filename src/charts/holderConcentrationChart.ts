import { chartZoomControls, type ChartZoomWindow, type HolderConcentrationSnapshot, type RangeKey } from "./lineChart.js";
import { percent } from "../utils/format.js";

const WIDTH = 760;
const HEIGHT = 310;
const PAD = { top: 22, right: 72, bottom: 44, left: 62 };

interface Options {
  records: HolderConcentrationSnapshot[];
  range: RangeKey;
  zoomWindow?: ChartZoomWindow;
}

const SERIES = [
  { label: "Largest Holder", color: "#987996" },
  { label: "Holders 2–10", color: "#b18452" },
  { label: "Holders 11–50", color: "#7185ad" },
  { label: "Outside Top 50", color: "#87918b" }
];

export function holderConcentrationChart(options: Options): string {
  const ranged = filterRange(options.records, options.range);
  const records = applyZoom(ranged, options.zoomWindow);
  if (records.length === 0) {
    return `<section class="chart chart-full"><h2>Holder Concentration</h2><div class="empty">No concentration snapshots in selected range</div></section>`;
  }

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => records.length === 1
    ? PAD.left + plotWidth / 2
    : PAD.left + (index / (records.length - 1)) * plotWidth;
  const y = (value: number) => PAD.top + (1 - value / 100) * plotHeight;
  const holderValues = records.map((record) => record.holderCount);
  const holderBounds = makeHolderBounds(holderValues);
  const holderY = (value: number) => PAD.top + (1 - (value - holderBounds.min) / (holderBounds.max - holderBounds.min)) * plotHeight;
  const boundaries = records.map((record, index) => ({
    x: x(index),
    values: [0, record.topHolderPct, record.top10Pct, record.top50Pct, 100]
  }));
  const areas = SERIES.map((series, index) =>
    `<path class="concentration-area" fill="${series.color}" d="${areaPath(boundaries, index, y)}" />`
  ).join("");
  const holderPoints = records.map((record, index) => ({ x: x(index), y: holderY(record.holderCount) }));
  const holderPath = holderPoints.length === 1
    ? `M ${PAD.left} ${holderPoints[0].y.toFixed(2)} L ${WIDTH - PAD.right} ${holderPoints[0].y.toFixed(2)}`
    : holderPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const ticks = [0, 25, 50, 75, 100];
  const latest = records.at(-1) as HolderConcentrationSnapshot;
  const zoomed = Boolean(options.zoomWindow && (options.zoomWindow.start > 0 || options.zoomWindow.end < 1));

  return `
    <section class="chart chart-full interactive-chart${zoomed ? " chart-zoomed" : ""}" data-chart-id="holder-concentration">
      <div class="chart-head">
        <div>
          <div class="chart-title-row">
            <h2>Holder Distribution</h2>
            ${infoTip("Tracks holder count and ownership concentration over time. The green line uses the adaptive left axis and counts unique wallets with a positive NUMMUS balance. The four colored areas use the right 0–100% axis and show mutually exclusive ownership groups. Broader distribution generally appears as falling Largest, Top 10 and Top 50 shares together with a growing Outside Top 50 share. Verified DEX pool owners and known project operational wallets are excluded only from concentration.")}
            ${chartZoomControls("holder-concentration", options.zoomWindow)}
          </div>
          <span>${dateLabel(records[0].date)} -> ${dateLabel(latest.date)}</span>
          <div class="chart-legend concentration-legend">${SERIES.map((series) => `<span><i class="legend-swatch" style="background:${series.color}"></i>${series.label}</span>`).join("")}<span><i class="legend-swatch" style="background:#57c990"></i>Unique Holder Wallets</span></div>
        </div>
      </div>
      ${summary(records)}
      <div class="chart-canvas">
        <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="Historical NUMMUS holder concentration by ownership group">
          <text class="axis-title holder-axis-title" x="${PAD.left}" y="${PAD.top - 8}">Unique holder wallets</text>
          <text class="axis-title" x="${WIDTH - PAD.right}" y="${PAD.top - 8}" text-anchor="end">Share of adjusted holdings</text>
          ${ticks.map((tick) => `<line class="grid-line" x1="${PAD.left}" y1="${y(tick)}" x2="${WIDTH - PAD.right}" y2="${y(tick)}" /><text class="tick-label" x="${WIDTH - PAD.right + 10}" y="${y(tick) + 4}">${tick}%</text>`).join("")}
          ${areas}
          <line class="axis-line" x1="${PAD.left}" y1="${HEIGHT - PAD.bottom}" x2="${WIDTH - PAD.right}" y2="${HEIGHT - PAD.bottom}" />
          <line class="axis-line holder-axis-line" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" />
          <line class="axis-line" x1="${WIDTH - PAD.right}" y1="${PAD.top}" x2="${WIDTH - PAD.right}" y2="${HEIGHT - PAD.bottom}" />
          <path class="holder-growth-path" d="${holderPath}" />
          ${holderBounds.ticks.map((tick) => `<text class="tick-label holder-y-label" x="${PAD.left - 10}" y="${holderY(tick) + 4}" text-anchor="end">${integer(tick)}</text>`).join("")}
          <text class="tick-label" x="${PAD.left}" y="${HEIGHT - 18}" text-anchor="start">${dateLabel(records[0].date)}</text>
          <text class="tick-label" x="${WIDTH - PAD.right}" y="${HEIGHT - 18}" text-anchor="end">${dateLabel(latest.date)}</text>
          <line class="crosshair" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" />
          <circle class="hover-dot" cx="${boundaries[0].x}" cy="${holderY(records[0].holderCount)}" r="5" />
          <rect class="hover-capture" x="${PAD.left}" y="${PAD.top}" width="${plotWidth}" height="${plotHeight}" />
        </svg>
        <div class="chart-tooltip"></div>
      </div>
      <script type="application/json" class="chart-data">${JSON.stringify({
        formatterName: "holder-concentration",
        points: records.map((record, index) => ({
          date: record.date,
          dateLabel: dateLabel(record.date),
          value: record.top50Pct,
          x: boundaries[index].x,
          y: holderY(record.holderCount),
          label: percent(record.top50Pct),
          series: [
            ...exclusiveValues(record).map((value, seriesIndex) => ({
            name: SERIES[seriesIndex].label,
            label: percent(value),
            kind: "neutral",
            color: SERIES[seriesIndex].color
            })),
            { name: "Unique holder wallets", label: integer(record.holderCount), kind: "neutral", color: "#57c990" },
            ...(record.newHolders === null ? [] : [{ name: "New holder wallets", label: integer(record.newHolders), kind: "neutral" }]),
            ...(record.exitedHolders === null ? [] : [{ name: "Exited holder wallets", label: integer(record.exitedHolders), kind: "neutral" }])
          ]
        }))
      }).replaceAll("<", "\\u003c")}</script>
    </section>`;
}

function exclusiveValues(record: HolderConcentrationSnapshot): number[] {
  return [record.topHolderPct, record.top10Pct - record.topHolderPct, record.top50Pct - record.top10Pct, record.othersPct];
}

function areaPath(points: Array<{ x: number; values: number[] }>, band: number, y: (value: number) => number): string {
  const expanded = points.length === 1
    ? [{ ...points[0], x: PAD.left }, { ...points[0], x: WIDTH - PAD.right }]
    : points;
  const upper = expanded.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${y(point.values[band + 1]).toFixed(2)}`).join(" ");
  const lower = [...expanded].reverse().map((point) => `L ${point.x.toFixed(2)} ${y(point.values[band]).toFixed(2)}`).join(" ");
  return `${upper} ${lower} Z`;
}

function summary(records: HolderConcentrationSnapshot[]): string {
  const metrics = [
    { label: "Unique Holder Wallets", key: "holderCount", className: "holder", inverse: false, formatter: integer },
    { label: "Largest Holder", key: "topHolderPct", className: "primary", inverse: true, formatter: percent },
    { label: "Top 10", key: "top10Pct", className: "secondary", inverse: true, formatter: percent },
    { label: "Top 50", key: "top50Pct", className: "tertiary", inverse: true, formatter: percent },
    { label: "Outside Top 50", key: "othersPct", className: "quaternary", inverse: false, formatter: percent }
  ] as const;
  return `<div class="multi-series-summary">${metrics.map((metric) => {
    const values = records.map((record) => record[metric.key]);
    return `<div class="multi-series-metric ${metric.className}"><span>${metric.label}</span><strong>${metric.formatter(values.at(-1) ?? 0)}</strong>${change(values, metric.inverse)}</div>`;
  }).join("")}</div>`;
}

function change(values: number[], inverse: boolean): string {
  if (values.length < 2) return `<span class="chart-change neutral">N/A for range</span>`;
  const first = values[0];
  const delta = (values.at(-1) ?? first) - first;
  const relative = first === 0 ? 0 : delta / Math.abs(first) * 100;
  const direction = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const favorable = delta === 0 ? "neutral" : (inverse ? delta < 0 : delta > 0) ? "favorable" : "adverse";
  return `<span class="chart-change ${favorable}">${direction} ${relative > 0 ? "+" : ""}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(relative)}%</span>`;
}

function filterRange(records: HolderConcentrationSnapshot[], range: RangeKey): HolderConcentrationSnapshot[] {
  if (range === "ALL" || records.length === 0) return records;
  const days = range === "1D" ? 1 : range === "7D" ? 7 : range === "30D" ? 30 : 365;
  const latest = new Date(`${records.at(-1)?.date}T00:00:00Z`).getTime();
  const cutoff = latest - days * 86_400_000;
  return records.filter((record) => new Date(`${record.date}T00:00:00Z`).getTime() >= cutoff);
}

function applyZoom(records: HolderConcentrationSnapshot[], zoom?: ChartZoomWindow): HolderConcentrationSnapshot[] {
  if (!zoom || records.length < 2) return records;
  const start = Math.floor(zoom.start * (records.length - 1));
  const end = Math.ceil(zoom.end * (records.length - 1));
  return records.slice(start, end + 1);
}

function dateLabel(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year.slice(2)}`;
}

function integer(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function makeHolderBounds(values: number[]): { min: number; max: number; ticks: number[] } {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const observedRange = rawMax - rawMin;
  const targetRange = observedRange > 0 ? observedRange * 1.5 : Math.max(400, rawMax * 0.05);
  const roughStep = targetRange / 4;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, roughStep)));
  const normalized = roughStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const center = (rawMin + rawMax) / 2;
  const roundedCenter = Math.round(center / step) * step;
  const min = Math.max(0, roundedCenter - step * 2);
  const max = min + step * 4;
  return { min, max, ticks: Array.from({ length: 5 }, (_, index) => min + step * index) };
}

function infoTip(text: string): string {
  return `<span class="info-tip" tabindex="0" aria-label="${text}">i<span class="info-popover" role="tooltip">${text}</span></span>`;
}
