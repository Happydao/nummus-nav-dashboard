import { strategyTransitionMarker } from "./strategyTransition.js";
import { maintenance } from "../utils/maintenance.js";
import type { HistoryFile } from "../utils/history.js";
import { applyZoomWindow, chartZoomControls, type ChartZoomWindow, type RangeKey } from "./lineChart.js";

const W = 760, H = 310;
const P = { left: 78, right: 86, top: 28, bottom: 44 };
const ORANGE = "#d99246", GREEN = "#57c990";
interface Point { date: string; tbtc: number | null; zec: number | null }
const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
const qty = (value: number, symbol: string) => `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value)} ${symbol}`;
const tick = (value: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 4, notation: "compact" }).format(value);

export function treasuryAccumulationChart(options: { history: HistoryFile; range: RangeKey; zoomWindow?: ChartZoomWindow }): string {
  const { history, range, zoomWindow } = options;
  const restart = maintenance.restartDate;
  const tbtc = new Map((history.tbtcHistory ?? []).filter(p => p.date < restart).map(p => [p.date, p.amount]));
  const zec = new Map((history.zecHistory ?? []).filter(p => p.date >= restart).map(p => [p.date, p.amount]));
  for (const record of history.records) {
    if (record.date < restart && valid(record.tbtcAmount)) tbtc.set(record.date, record.tbtcAmount);
    if (record.date >= restart && valid(record.zecAmount)) zec.set(record.date, record.zecAmount);
  }
  // A shared date domain includes both phases, even when one series has no observations.
  const dates = [...new Set([...tbtc.keys(), ...zec.keys(), ...history.records.map(p => p.date), restart])].sort();
  const lastDate = dates.at(-1)!;
  const days = range === "1D" ? 1 : range === "7D" ? 7 : range === "30D" ? 30 : 365;
  const ranged = dates.filter(date => range === "ALL" || stamp(date) >= stamp(lastDate) - days * 86400000);
  const points: Point[] = applyZoomWindow(ranged.map(date => ({ date, tbtc: tbtc.get(date) ?? null, zec: zec.get(date) ?? null })), zoomWindow);
  if (!points.length) return `<section class="chart" data-chart-id="treasury-accumulation"><h2>Treasury Accumulation</h2><div class="empty">No observations in selected range</div></section>`;
  const left = P.left, right = W - P.right, bottom = H - P.bottom;
  const first = stamp(points[0].date), last = stamp(points.at(-1)!.date);
  const x = (date: string) => first === last ? (left + right) / 2 : left + (stamp(date) - first) / (last - first) * (right - left);
  const upper = (key: "tbtc" | "zec") => {
    const max = Math.max(0, ...points.flatMap(p => valid(p[key]) ? [p[key]!] : []));
    if (!max) return 1;
    const step = 10 ** Math.floor(Math.log10(max)) / 4;
    return Math.ceil(max * 1.15 / step) * step;
  };
  const tMax = upper("tbtc"), zMax = upper("zec");
  const y = (value: number, max: number) => P.top + (1 - value / max) * (bottom - P.top);
  function series(key: "tbtc" | "zec", max: number, color: string): string {
    let pen = false;
    const path = points.map(p => {
      const value = p[key];
      if (!valid(value)) { pen = false; return ""; }
      const command = `${pen ? "L" : "M"} ${x(p.date).toFixed(2)} ${y(value, max).toFixed(2)}`;
      pen = true;
      return command;
    }).join(" ");
    const observations = points.filter(p => valid(p[key]));
    return `<path class="treasury-series" stroke="${color}" d="${path}" />${observations.map((p, i) => i === 0 || i === observations.length - 1 ? `<circle fill="${color}" cx="${x(p.date)}" cy="${y(p[key]!, max)}" r="4" />` : "").join("")}`;
  }
  const ticks = [0, .25, .5, .75, 1];
  const dateCount = Math.min(typeof window !== "undefined" && window.innerWidth <= 620 ? 3 : 5, Math.max(2, points.length));
  const dateTicks = [...new Set(Array.from({ length: dateCount }, (_, i) => points[Math.round(i * (points.length - 1) / (dateCount - 1))].date))];
  const interactive = points.flatMap(p => {
    const isZec = valid(p.zec), value = isZec ? p.zec : p.tbtc;
    if (!valid(value)) return [];
    return [{ date: p.date, dateLabel: p.date, value, x: x(p.date), y: y(value, isZec ? zMax : tMax), label: qty(value, isZec ? "ZEC" : "tBTC"),
      series: [{ name: isZec ? "ZEC accumulation" : "tBTC accumulation (historical)", label: qty(value, isZec ? "ZEC" : "tBTC"), kind: "neutral", color: isZec ? GREEN : ORANGE }] }];
  });
  const summary = (key: "tbtc" | "zec", symbol: string, color: string) => {
    const observed = points.filter(p => valid(p[key]));
    const latest = observed.at(-1);
    const start = observed[0]?.[key];
    const end = latest?.[key];
    const change = observed.length > 1 && valid(start) && start > 0 && valid(end) ? `${((end / start - 1) * 100).toFixed(2)}% in selected range` : "N/A for range";
    return `<div class="dual-axis-metric ${key === "tbtc" ? "primary" : "secondary"}"><span style="color:${color}">${symbol}${key === "tbtc" ? " · historical" : " · active"}</span><strong style="color:${color}">${valid(end) ? qty(end, symbol) : "n/a"}</strong><small>${latest ? `As of ${latest.date} · ${change}` : "Awaiting verified observation"}</small></div>`;
  };
  const zoomed = Boolean(zoomWindow && (zoomWindow.start > 0 || zoomWindow.end < 1));
  return `<section class="chart interactive-chart treasury-chart${zoomed ? " chart-zoomed" : ""}" data-chart-id="treasury-accumulation">
    <div class="chart-head"><div><div class="chart-title-row"><h2>Treasury Accumulation</h2>${transitionInfoTip()}${chartZoomControls("treasury-accumulation", zoomWindow)}</div><span>${points[0].date} → ${points.at(-1)!.date}</span>
    <div class="chart-legend"><span><i class="legend-swatch" style="background:${ORANGE}"></i>tBTC · left axis</span><span><i class="legend-swatch" style="background:${GREEN}"></i>ZEC · right axis</span></div></div></div>
    <div class="dual-axis-summary">${summary("tbtc", "tBTC", ORANGE)}${summary("zec", "ZEC", GREEN)}</div>
    <div class="chart-canvas"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Treasury accumulation: historical tBTC on the left axis, ZEC from November 22 on the right axis">
      <text class="axis-title" style="fill:${ORANGE}" x="${left}" y="16">tBTC</text><text class="axis-title" style="fill:${GREEN}" x="${right}" y="16" text-anchor="end">ZEC</text>
      ${ticks.map(f => `<line class="grid-line" x1="${left}" y1="${y(f, 1)}" x2="${right}" y2="${y(f, 1)}" /><text class="tick-label" style="fill:${ORANGE}" x="${left - 10}" y="${y(f, 1) + 4}" text-anchor="end">${tick(f * tMax)}</text><text class="tick-label" style="fill:${GREEN}" x="${right + 10}" y="${y(f, 1) + 4}">${tick(f * zMax)}</text>`).join("")}
      <line class="axis-line" x1="${left}" x2="${right}" y1="${bottom}" y2="${bottom}" /><line class="axis-line" x1="${left}" x2="${left}" y1="${P.top}" y2="${bottom}" /><line class="axis-line" x1="${right}" x2="${right}" y1="${P.top}" y2="${bottom}" />
      ${dateTicks.map(date => `<text class="tick-label" x="${x(date)}" y="${H - 18}" text-anchor="${date === points[0].date ? "start" : date === points.at(-1)!.date ? "end" : "middle"}">${date.slice(8)}-${date.slice(5, 7)}-${date.slice(2, 4)}</text>`).join("")}
      ${series("tbtc", tMax, ORANGE)}${series("zec", zMax, GREEN)}
      ${strategyTransitionMarker(points.map(point => ({ date: point.date, x: x(point.date) })), P.top, bottom, true)}
      <line class="crosshair" x1="${left}" x2="${left}" y1="${P.top}" y2="${bottom}" /><circle class="hover-dot" cx="${interactive[0]?.x ?? left}" cy="${interactive[0]?.y ?? bottom}" r="5" /><rect class="hover-capture" x="${left}" y="${P.top}" width="${right - left}" height="${bottom - P.top}" />
    </svg><div class="chart-tooltip"></div></div>
    <script type="application/json" class="chart-data">${JSON.stringify({ formatterName: "treasury-accumulation", points: interactive }).replaceAll("<", "\\u003c")}</script>
  </section>`;
}

function transitionInfoTip(): string {
  const text = "Following the community's decision, Nummus began transitioning its entire treasury and ongoing accumulation strategy from tBTC to Zcash (ZEC) on November 22, 2026. The orange line preserves historical tBTC balances on the left axis; the green line tracks ZEC holdings on the right axis, including the initial converted treasury balance. The dashed vertical line marks the transition date. The two independent scales measure different token units, so line heights are not directly comparable.";
  return `<span class="info-tip" tabindex="0" aria-label="${text}">i<span class="info-popover" role="tooltip">${text}</span></span>`;
}
