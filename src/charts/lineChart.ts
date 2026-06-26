import type { DailySnapshot } from "../utils/history.js";

export function lineChart(
  title: string,
  records: DailySnapshot[],
  key: keyof Pick<DailySnapshot, "nav" | "backing" | "premium" | "vaultUsd" | "supply">
): string {
  const points = records
    .map((record) => ({ date: record.date, value: record[key] }))
    .filter((point): point is { date: string; value: number } => typeof point.value === "number");

  if (points.length === 0) {
    return `<section class="chart"><h2>${title}</h2><div class="empty">No snapshots yet</div></section>`;
  }

  const width = 640;
  const height = 220;
  const pad = 28;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => {
    const x = pad + index * xStep;
    const y = height - pad - ((point.value - min) / range) * (height - pad * 2);
    return { ...point, x, y };
  });
  const path = coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return `
    <section class="chart">
      <div class="chart-head">
        <h2>${title}</h2>
        <span>${points[0].date} -> ${points.at(-1)?.date}</span>
      </div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">
        <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" />
        <line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" />
        <path d="${path}" />
        ${coords.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3"><title>${point.date}: ${point.value}</title></circle>`).join("")}
      </svg>
    </section>
  `;
}
