import { maintenance } from "../utils/maintenance.js";

export const STRATEGY_TRANSITION_EXPLANATION = "The vertical dashed line marks November 22, 2026, when Nummus began transitioning its entire treasury and ongoing accumulation strategy from tBTC to Zcash (ZEC), following the community's decision.";

// Use visible chart coordinates so the reference follows each chart's range and zoom,
// including charts whose dates are spaced by observation index rather than calendar time.
export function strategyTransitionMarker(
  points: Array<{ date: string; x: number }>,
  top: number,
  bottom: number,
  showLabel = false
): string {
  const date = maintenance.restartDate;
  if (!points.length || date < points[0].date || date > points.at(-1)!.date) return "";
  const nextIndex = points.findIndex(point => point.date >= date);
  const next = points[nextIndex];
  const previous = points[Math.max(0, nextIndex - 1)];
  const timestamp = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const fraction = next.date === previous.date ? 0 : (timestamp(date) - timestamp(previous.date)) / (timestamp(next.date) - timestamp(previous.date));
  const x = previous.x + fraction * (next.x - previous.x);
  const labelToRight = x < (points[0].x + points.at(-1)!.x) / 2;
  return `<line class="strategy-transition${showLabel ? " treasury-transition" : ""}" data-transition-date="${date}" x1="${x}" x2="${x}" y1="${top}" y2="${bottom}"><title>tBTC to ZEC treasury strategy transition · November 22, 2026</title></line>${showLabel ? `<text class="tick-label" x="${x + (labelToRight ? 7 : -7)}" y="${top + 15}" text-anchor="${labelToRight ? "start" : "end"}">tBTC → ZEC · Nov 22</text>` : ""}`;
}
