import type { DailySnapshot, SupplySnapshot, TbtcSnapshot } from "../utils/history.js";

export type RangeKey = "1D" | "7D" | "30D" | "1Y" | "ALL";
export type ChartRecord = DailySnapshot | TbtcSnapshot | SupplySnapshot | MarketDepthSnapshot | VaultDrawdownSnapshot | DexLiquiditySnapshot | HolderGrowthSnapshot | HolderConcentrationSnapshot;

export interface MarketDepthSnapshot {
  date: string;
  buyDepthUsd: number;
  sellDepthUsd: number;
}

export interface VaultDrawdownSnapshot {
  date: string;
  drawdown: number;
}

export interface DexLiquiditySnapshot {
  date: string;
  liquidityUsd: number;
}

export interface HolderGrowthSnapshot {
  date: string;
  holderCount: number;
  newHolders: number | null;
  exitedHolders: number | null;
}

export interface HolderConcentrationSnapshot {
  date: string;
  holderCount: number;
  newHolders: number | null;
  exitedHolders: number | null;
  topHolderPct: number;
  top10Pct: number;
  top50Pct: number;
  othersPct: number;
  topHolderAmount: number;
  top10Amount: number;
  top50Amount: number;
  othersAmount: number;
}

export interface ChartZoomWindow {
  start: number;
  end: number;
}

export interface ChartOptions {
  id: string;
  title: string;
  records: ChartRecord[];
  key: ChartKey;
  range: RangeKey;
  formatter: (value: number) => string;
  primaryLabel?: string;
  primaryLegendLabel?: string;
  tooltipOrder?: "primary-first" | "secondary-first";
  axisFormatter?: (value: number) => string;
  yLabel: string;
  yMin?: number;
  yMax?: number;
  showMarkers?: boolean;
  showArea?: boolean;
  includePreviousPoint?: boolean;
  changeMode?: ChangeMode;
  info?: string;
  tooltipExtras?: Array<{ key: ChartKey; label: string; formatter?: (value: number) => string }>;
  additionalSeries?: Array<{
    key: ChartKey;
    label: string;
    legendLabel?: string;
    formatter?: (value: number) => string;
    className: string;
    changeMode?: ChangeMode;
  }>;
  showAllSeriesSummary?: boolean;
  secondary?: {
    key: ChartKey;
    label: string;
    legendLabel?: string;
    formatter?: (value: number) => string;
    axisFormatter?: (value: number) => string;
    axisLabel?: string;
    changeMode?: ChangeMode;
    independentAxis?: boolean;
    yMin?: number;
    yMax?: number;
  };
  fullWidth?: boolean;
  action?: {
    label: string;
    href: string;
  };
  zoomWindow?: ChartZoomWindow;
}

type ChangeMode = "standard" | "reduction" | "inverse" | "percentage-points";

type ChartKey = keyof Pick<DailySnapshot, "nav" | "backing" | "premium" | "vaultUsd" | "supply" | "marketPrice"> | "amount" | "buyDepthUsd" | "sellDepthUsd" | "drawdown" | "liquidityUsd" | "holderCount" | "newHolders" | "exitedHolders" | "topHolderPct" | "top10Pct" | "top50Pct" | "othersPct" | "topHolderAmount" | "top10Amount" | "top50Amount" | "othersAmount";

interface ChartPoint {
  date: string;
  value: number;
}

const WIDTH = 760;
const HEIGHT = 310;
const PAD = {
  top: 22,
  right: 22,
  bottom: 44,
  left: 82
};

export function lineChart(options: ChartOptions): string {
  const allPoints = toPoints(options.records, options.key);
  const rangePoints = filterByRange(allPoints, options.range, Boolean(options.includePreviousPoint));
  const points = applyZoomWindow(rangePoints, options.zoomWindow);
  const secondaryByDate = options.secondary ? toPointMap(options.records, options.secondary.key) : new Map<string, number>();
  const extrasByKey = new Map(
    (options.tooltipExtras ?? []).map((extra) => [extra.key, toPointMap(options.records, extra.key)])
  );
  const additionalByKey = new Map(
    (options.additionalSeries ?? []).map((series) => [series.key, toPointMap(options.records, series.key)])
  );
  const hasIndependentAxis = Boolean(options.secondary?.independentAxis);

  if (points.length === 0) {
    return `<section class="chart"><h2>${options.title}</h2><div class="empty">No snapshots in selected range</div></section>`;
  }

  const secondaryValues = points
    .map((point) => secondaryByDate.get(point.date))
    .filter((value): value is number => typeof value === "number");
  const additionalValues = [...additionalByKey.values()].flatMap((byDate) =>
    points.map((point) => byDate.get(point.date)).filter((value): value is number => typeof value === "number")
  );
  const values = hasIndependentAxis
    ? points.map((point) => point.value)
    : [...points.map((point) => point.value), ...secondaryValues, ...additionalValues];
  const rawMin = options.yMin ?? Math.min(...values);
  const rawMax = options.yMax ?? Math.max(...values);
  const yMin = options.yMin ?? niceFloor(rawMin);
  const yMax = options.yMax ?? niceCeil(rawMax === rawMin ? rawMax + 1 : rawMax);
  const secondaryRawMin = secondaryValues.length > 0 ? Math.min(...secondaryValues) : yMin;
  const secondaryRawMax = secondaryValues.length > 0 ? Math.max(...secondaryValues) : yMax;
  const secondaryYMin = hasIndependentAxis
    ? (options.secondary?.yMin ?? niceFloor(secondaryRawMin))
    : yMin;
  const secondaryYMax = hasIndependentAxis
    ? (options.secondary?.yMax ?? niceCeil(secondaryRawMax === secondaryRawMin ? secondaryRawMax + 1 : secondaryRawMax))
    : yMax;
  const xMin = new Date(`${points[0].date}T00:00:00.000Z`).getTime();
  const xMax = new Date(`${points.at(-1)?.date}T00:00:00.000Z`).getTime();
  const xRange = xMax - xMin || 1;
  const plotRight = WIDTH - (hasIndependentAxis ? 86 : PAD.right);
  const chartWidth = plotRight - PAD.left;
  const chartHeight = HEIGHT - PAD.top - PAD.bottom;
  const xForTimestamp = (timestamp: number) =>
    xMax === xMin ? PAD.left + chartWidth / 2 : PAD.left + ((timestamp - xMin) / xRange) * chartWidth;
  const coords = points.map((point) => {
    const timestamp = new Date(`${point.date}T00:00:00.000Z`).getTime();
    const x = xForTimestamp(timestamp);
    const y = PAD.top + (1 - (point.value - yMin) / (yMax - yMin || 1)) * chartHeight;
    return { ...point, x, y };
  });
  const secondaryCoords = options.secondary
    ? coords
        .map((point) => {
          const value = secondaryByDate.get(point.date);
          if (typeof value !== "number") return null;
          const y = PAD.top + (1 - (value - secondaryYMin) / (secondaryYMax - secondaryYMin || 1)) * chartHeight;
          return { date: point.date, value, x: point.x, y };
        })
        .filter((point): point is ChartPoint & { x: number; y: number } => point !== null)
    : [];
  const additionalCoords = (options.additionalSeries ?? []).map((series) => ({
    series,
    points: coords.flatMap((point) => {
      const value = additionalByKey.get(series.key)?.get(point.date);
      if (typeof value !== "number") return [];
      const y = PAD.top + (1 - (value - yMin) / (yMax - yMin || 1)) * chartHeight;
      return [{ date: point.date, value, x: point.x, y }];
    })
  }));
  const path = makePath(coords, plotRight);
  const secondaryPath = secondaryCoords.length > 0 ? makePath(secondaryCoords, plotRight) : "";
  const areaPath =
    coords.length > 1
      ? `${path} L ${coords.at(-1)?.x.toFixed(2)} ${HEIGHT - PAD.bottom} L ${coords[0].x.toFixed(2)} ${HEIGHT - PAD.bottom} Z`
      : "";
  const yTicks = makeTicks(yMin, yMax, 5);
  const secondaryYTicks = hasIndependentAxis ? makeTicks(secondaryYMin, secondaryYMax, 5) : [];
  const xTicks = makeDateTicks(points, responsiveTickCount());
  const latest = points.at(-1);
  const axisFormatter = options.axisFormatter ?? options.formatter;
  const changeSummary = renderChangeSummary(options, points, secondaryCoords);
  const dualAxisSummary = hasIndependentAxis
    ? renderDualAxisSummary(options, points, secondaryCoords)
    : "";
  const allSeriesSummary = options.showAllSeriesSummary
    ? renderAllSeriesSummary(options, points, secondaryCoords, additionalCoords)
    : "";
  const zoomed = Boolean(options.zoomWindow && (options.zoomWindow.start > 0 || options.zoomWindow.end < 1));

  return `
    <section class="chart interactive-chart${options.fullWidth ? " chart-full" : ""}${zoomed ? " chart-zoomed" : ""}" data-chart-id="${options.id}">
      <div class="chart-head">
        <div>
          <div class="chart-title-row">
            <h2>${options.title}</h2>
            ${options.info ? infoTip(options.info) : ""}
            ${options.action ? chartAction(options.action.label, options.action.href) : ""}
            ${chartZoomControls(options.id, options.zoomWindow)}
          </div>
          <span>${formatDateShort(points[0].date)} -> ${formatDateShort(points.at(-1)?.date ?? points[0].date)}</span>
          ${options.secondary ? legend(options.primaryLegendLabel ?? "NAV", options.secondary.legendLabel ?? options.secondary.label, options.additionalSeries) : ""}
        </div>
        ${
          hasIndependentAxis || options.showAllSeriesSummary
            ? ""
            : `<div class="chart-current"><strong>${latest ? options.formatter(latest.value) : "n/a"}</strong>${changeSummary}</div>`
        }
      </div>
      ${dualAxisSummary}
      ${allSeriesSummary}
      <div class="chart-canvas">
        <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${options.title}">
          <text class="axis-title y-axis-title${hasIndependentAxis ? " primary-axis-title" : ""}" x="${PAD.left}" y="${PAD.top - 8}">${options.yLabel}</text>
          ${
            hasIndependentAxis
              ? `<text class="axis-title secondary-axis-title" x="${WIDTH - 4}" y="${PAD.top - 8}" text-anchor="end">${escapeHtml(options.secondary?.axisLabel ?? options.secondary?.label ?? "")}</text>`
              : ""
          }
          <text class="axis-title x-axis-title" x="${plotRight}" y="${HEIGHT - 7}" text-anchor="end">Date</text>
          ${yTicks
            .map((tick) => {
              const y = PAD.top + (1 - (tick - yMin) / (yMax - yMin || 1)) * chartHeight;
              return `
                <line class="grid-line" x1="${PAD.left}" y1="${y}" x2="${plotRight}" y2="${y}" />
                <text class="tick-label y-tick${hasIndependentAxis ? " primary-y-tick" : ""}" x="${PAD.left - 10}" y="${y + 4}" text-anchor="end">${axisFormatter(tick)}</text>
              `;
            })
            .join("")}
          ${secondaryYTicks
            .map((tick) => {
              const y = PAD.top + (1 - (tick - secondaryYMin) / (secondaryYMax - secondaryYMin || 1)) * chartHeight;
              return `<text class="tick-label secondary-y-tick" x="${plotRight + 10}" y="${y + 4}" text-anchor="start">${(options.secondary?.axisFormatter ?? options.secondary?.formatter ?? options.formatter)(tick)}</text>`;
            })
            .join("")}
          ${xTicks
            .map((tick) => {
              const x = xForTimestamp(tick.timestamp);
              return `
                <line class="x-grid-line" x1="${x}" y1="${PAD.top}" x2="${x}" y2="${HEIGHT - PAD.bottom}" />
                <line class="x-tick-line" x1="${x}" y1="${HEIGHT - PAD.bottom}" x2="${x}" y2="${HEIGHT - PAD.bottom + 5}" />
                <text class="tick-label x-tick" x="${x}" y="${HEIGHT - 18}" text-anchor="middle">${tick.label}</text>
              `;
            })
            .join("")}
          <line class="axis-line" x1="${PAD.left}" y1="${HEIGHT - PAD.bottom}" x2="${plotRight}" y2="${HEIGHT - PAD.bottom}" />
          <line class="axis-line${hasIndependentAxis ? " primary-axis-line" : ""}" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" />
          ${hasIndependentAxis ? `<line class="axis-line secondary-axis-line" x1="${plotRight}" y1="${PAD.top}" x2="${plotRight}" y2="${HEIGHT - PAD.bottom}" />` : ""}
          ${areaPath && options.showArea !== false ? `<path class="area-path" d="${areaPath}" />` : ""}
          <path class="series-path" d="${path}" />
          ${secondaryPath ? `<path class="series-path secondary-series-path" d="${secondaryPath}" />` : ""}
          ${additionalCoords.map(({ series, points: seriesPoints }) => seriesPoints.length > 0
            ? `<path class="series-path ${escapeHtml(series.className)}" d="${makePath(seriesPoints, plotRight)}" />`
            : "").join("")}
          ${
            options.showMarkers || coords.length === 1
              ? coords.map((point, index) => marker(point, index)).join("")
              : ""
          }
          <line class="crosshair" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${HEIGHT - PAD.bottom}" />
          <circle class="hover-dot" cx="${coords[0].x}" cy="${coords[0].y}" r="5" />
          <rect class="hover-capture" x="${PAD.left}" y="${PAD.top}" width="${chartWidth}" height="${chartHeight}" />
        </svg>
        <div class="chart-tooltip"></div>
      </div>
      <script type="application/json" class="chart-data">${JSON.stringify({
        formatterName: options.id,
        points: coords.map((point) => ({
          date: point.date,
          dateLabel: formatDateShort(point.date),
          value: point.value,
          x: point.x,
          y: point.y,
          label: options.formatter(point.value),
          series: options.secondary || options.tooltipExtras?.length || options.additionalSeries?.length
            ? tooltipSeries(
                options,
                point.value,
                secondaryByDate.get(point.date),
                point.date,
                extrasByKey,
                additionalByKey
              )
            : undefined
        }))
      })}</script>
    </section>
  `;
}

function tooltipSeries(
  options: ChartOptions,
  primaryValue: number,
  secondaryValue: number | undefined,
  date: string,
  extrasByKey: Map<ChartKey, Map<string, number>>,
  additionalByKey: Map<ChartKey, Map<string, number>>
): Array<{ name: string; label: string; kind: "primary" | "secondary" | "neutral" }> {
  const primary = {
    name: options.primaryLabel ?? "NAV",
    label: options.formatter(primaryValue),
    kind: "primary" as const
  };
  const secondary =
    typeof secondaryValue === "number"
      ? {
          name: options.secondary?.label ?? "Secondary",
          label: (options.secondary?.formatter ?? options.formatter)(secondaryValue),
          kind: "secondary" as const
        }
      : null;

  const main = !secondary ? [primary] : options.tooltipOrder === "primary-first"
    ? [primary, secondary]
    : [secondary, primary];
  const extras = (options.tooltipExtras ?? []).flatMap((extra) => {
    const value = extrasByKey.get(extra.key)?.get(date);
    return typeof value === "number"
      ? [{ name: extra.label, label: extra.formatter?.(value) ?? numberInteger(value), kind: "neutral" as const }]
      : [];
  });
  const additional = (options.additionalSeries ?? []).flatMap((series) => {
    const value = additionalByKey.get(series.key)?.get(date);
    return typeof value === "number"
      ? [{ name: series.label, label: (series.formatter ?? options.formatter)(value), kind: "neutral" as const }]
      : [];
  });
  return [...main, ...additional, ...extras];
}

function renderAllSeriesSummary(
  options: ChartOptions,
  primaryPoints: ChartPoint[],
  secondaryPoints: ChartPoint[],
  additional: Array<{ series: NonNullable<ChartOptions["additionalSeries"]>[number]; points: ChartPoint[] }>
): string {
  const series = [
    { label: options.primaryLabel ?? "Primary", points: primaryPoints, formatter: options.formatter, className: "primary", changeMode: options.changeMode ?? "standard" },
    ...(options.secondary ? [{ label: options.secondary.label, points: secondaryPoints, formatter: options.secondary.formatter ?? options.formatter, className: "secondary", changeMode: options.secondary.changeMode ?? "standard" }] : []),
    ...additional.map((item) => ({ label: item.series.label, points: item.points, formatter: item.series.formatter ?? options.formatter, className: item.series.className, changeMode: item.series.changeMode ?? "standard" }))
  ];
  return `<div class="multi-series-summary">${series.map((item) => {
    const latest = item.points.at(-1)?.value;
    return `<div class="multi-series-metric ${escapeHtml(item.className)}"><span>${escapeHtml(item.label)}</span><strong>${typeof latest === "number" ? item.formatter(latest) : "n/a"}</strong>${changeLine(item.points, item.changeMode)}</div>`;
  }).join("")}</div>`;
}

function numberInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function renderDualAxisSummary(
  options: ChartOptions,
  primaryPoints: ChartPoint[],
  secondaryPoints: ChartPoint[]
): string {
  const primaryLatest = primaryPoints.at(-1)?.value;
  const secondaryLatest = secondaryPoints.at(-1)?.value;
  const secondaryFormatter = options.secondary?.formatter ?? options.formatter;

  return `
    <div class="dual-axis-summary">
      <div class="dual-axis-metric primary">
        <strong>${typeof primaryLatest === "number" ? options.formatter(primaryLatest) : "n/a"}</strong>
        ${changeLine(primaryPoints, options.changeMode ?? "standard", options.primaryLabel ?? "NAV")}
      </div>
      <div class="dual-axis-metric secondary">
        <strong>${typeof secondaryLatest === "number" ? secondaryFormatter(secondaryLatest) : "n/a"}</strong>
        ${changeLine(secondaryPoints, options.secondary?.changeMode ?? "standard", "Price")}
      </div>
    </div>
  `;
}

function renderChangeSummary(
  options: ChartOptions,
  points: ChartPoint[],
  secondaryPoints: ChartPoint[]
): string {
  if (options.secondary) {
    return `
      <div class="chart-change-list">
        ${changeLine(points, options.changeMode ?? "standard", options.primaryLabel ?? "NAV")}
        ${changeLine(secondaryPoints, options.secondary.changeMode ?? "standard", options.secondary.label)}
      </div>
    `;
  }

  return `<div class="chart-change-list">${changeLine(points, options.changeMode ?? "standard")}</div>`;
}

function changeLine(points: ChartPoint[], mode: ChangeMode, label?: string): string {
  const prefix = label ? `${escapeHtml(label)} ` : "";
  if (points.length < 2) {
    return `<span class="chart-change neutral">${prefix}N/A for range</span>`;
  }

  const first = points[0].value;
  const last = points.at(-1)?.value ?? first;
  const delta = last - first;
  const relative = first === 0 ? null : (delta / Math.abs(first)) * 100;
  const direction = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const state = changeState(delta, mode);

  if (mode === "reduction" && relative !== null) {
    const wording = delta < 0 ? "reduction" : delta > 0 ? "increase" : "change";
    return `<span class="chart-change ${state}">${direction} ${formatChange(Math.abs(relative), false)} ${wording}</span>`;
  }

  if (mode === "percentage-points") {
    const relativeText = relative === null ? "" : `${formatChange(relative)} · `;
    return `<span class="chart-change ${state}">${direction} ${relativeText}${formatSignedNumber(delta)} pp</span>`;
  }

  const value = relative === null ? "N/A" : formatChange(relative);
  return `<span class="chart-change ${state}">${prefix}${direction} ${value}</span>`;
}

function changeState(delta: number, mode: ChangeMode): "favorable" | "adverse" | "neutral" {
  if (delta === 0) return "neutral";
  if (mode === "inverse" || mode === "reduction") return delta < 0 ? "favorable" : "adverse";
  return delta > 0 ? "favorable" : "adverse";
}

function formatChange(value: number, signed = true): string {
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}%`;
}

function formatSignedNumber(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
}

function makePath(points: Array<ChartPoint & { x: number; y: number }>, plotRight: number): string {
  if (points.length === 1) {
    return `M ${PAD.left} ${points[0].y.toFixed(2)} L ${plotRight} ${points[0].y.toFixed(2)}`;
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function legend(primaryLabel: string, secondaryLabel: string, additional: ChartOptions["additionalSeries"] = []): string {
  return `
    <div class="chart-legend" aria-label="Chart legend">
      <span><i class="legend-swatch primary"></i>${escapeHtml(primaryLabel)}</span>
      <span><i class="legend-swatch secondary"></i>${escapeHtml(secondaryLabel)}</span>
      ${(additional ?? []).map((series) => `<span><i class="legend-swatch ${escapeHtml(series.className)}"></i>${escapeHtml(series.legendLabel ?? series.label)}</span>`).join("")}
    </div>
  `;
}

function chartAction(label: string, href: string): string {
  return `<a class="chart-action" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function infoTip(text: string): string {
  return `
    <span class="info-tip" tabindex="0" aria-label="${escapeHtml(text)}">
      i
      <span class="info-popover" role="tooltip">${escapeHtml(text)}</span>
    </span>
  `;
}

export function rangeButtons(selected: RangeKey): string {
  const ranges: RangeKey[] = ["1D", "7D", "30D", "1Y", "ALL"];
  return `
    <div class="range-selector" aria-label="Chart range">
      ${ranges
        .map(
          (range) =>
            `<button type="button" data-range="${range}" class="${range === selected ? "active" : ""}">${range}</button>`
        )
        .join("")}
    </div>
  `;
}

export function chartZoomControls(id: string, zoomWindow?: ChartZoomWindow): string {
  const isZoomed = Boolean(zoomWindow && (zoomWindow.start > 0 || zoomWindow.end < 1));
  return `
    <div class="chart-zoom-controls" aria-label="${escapeHtml(id)} chart zoom controls">
      <button type="button" data-chart-zoom="out" title="Zoom out" aria-label="Zoom out">-</button>
      <button type="button" data-chart-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>
      <button type="button" class="zoom-reset" data-chart-zoom="reset" title="Reset zoom" aria-label="Reset zoom"${isZoomed ? "" : " disabled"}>Reset</button>
    </div>
  `;
}

export function applyZoomWindow<T>(points: T[], zoomWindow?: ChartZoomWindow): T[] {
  if (!zoomWindow || points.length <= 2) return points;
  const lastIndex = points.length - 1;
  const startIndex = Math.max(0, Math.min(lastIndex - 1, Math.floor(zoomWindow.start * lastIndex)));
  const endIndex = Math.max(startIndex + 1, Math.min(lastIndex, Math.ceil(zoomWindow.end * lastIndex)));
  return points.slice(startIndex, endIndex + 1);
}

function toPoints(records: ChartRecord[], key: ChartOptions["key"]): ChartPoint[] {
  return records
    .map((record) => ({
      date: record.date,
      value: (record as unknown as Record<string, unknown>)[key]
    }))
    .filter((point): point is ChartPoint => typeof point.value === "number")
    .sort((a, b) => a.date.localeCompare(b.date));
}

function toPointMap(records: ChartRecord[], key: ChartOptions["key"]): Map<string, number> {
  return new Map(toPoints(records, key).map((point) => [point.date, point.value]));
}

function filterByRange(points: ChartPoint[], range: RangeKey, includePreviousPoint: boolean): ChartPoint[] {
  if (range === "ALL" || points.length === 0) return points;

  const lastDate = new Date(`${points.at(-1)?.date}T00:00:00.000Z`);
  const cutoff = new Date(lastDate);
  const days = range === "1D" ? 1 : range === "7D" ? 7 : range === "30D" ? 30 : 365;
  cutoff.setUTCDate(cutoff.getUTCDate() - days);

  const filtered = points.filter((point) => new Date(`${point.date}T00:00:00.000Z`) >= cutoff);
  if (!includePreviousPoint) return filtered;

  const firstFilteredDate = filtered[0]?.date ?? points.at(-1)?.date;
  if (!firstFilteredDate) return filtered;
  const previous = [...points]
    .reverse()
    .find((point) => point.date < firstFilteredDate);
  if (filtered.length === 0) {
    const fallback = previous ?? points.at(-1);
    return fallback ? [fallback] : [];
  }

  return previous ? [previous, ...filtered] : filtered;
}

function makeTicks(min: number, max: number, count: number): number[] {
  if (count <= 1) return [min, max];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, index) => min + step * index);
}

function makeDateTicks(
  points: ChartPoint[],
  maxCount: number
): Array<{ timestamp: number; label: string }> {
  const start = new Date(`${points[0].date}T00:00:00.000Z`).getTime();
  const end = new Date(`${points.at(-1)?.date ?? points[0].date}T00:00:00.000Z`).getTime();
  const visibleDays = Math.max(1, Math.round((end - start) / 86_400_000));
  const count = Math.max(2, Math.min(maxCount, visibleDays + 1));
  return Array.from({ length: count }, (_, index) => {
    const timestamp = start + ((end - start) * index) / Math.max(1, count - 1);
    const date = new Date(timestamp).toISOString().slice(0, 10);
    return { timestamp, label: formatDateShort(date) };
  });
}

function responsiveTickCount(): number {
  return typeof window !== "undefined" && window.innerWidth <= 620 ? 4 : 8;
}

function marker(point: ChartPoint & { x: number; y: number }, index: number): string {
  return `<circle class="series-marker" data-index="${index}" cx="${point.x}" cy="${point.y}" r="3.5" />`;
}

function niceFloor(value: number): number {
  if (value > 0 && value < 1) return 0;
  return Math.floor(value / magnitude(value)) * magnitude(value);
}

function niceCeil(value: number): number {
  return Math.ceil(value / magnitude(value)) * magnitude(value);
}

function magnitude(value: number): number {
  if (value === 0) return 1;
  return 10 ** Math.floor(Math.log10(Math.abs(value)));
}

function formatDateShort(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}-${month}-${year.slice(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
