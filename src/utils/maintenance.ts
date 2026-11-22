// The pause is a closed historical interval; collection resumed on this UTC date.
export const maintenance = {
  enabled: false,
  frozenDate: "2026-11-17",
  restartDate: "2026-11-22",
  nextAsset: {
    symbol: "ZEC",
    mint: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
    wallet: "HtT3yMsAavLQYmd6VSbXSdbAefyZUrrFeEPoTPivde3s",
    excludeTbtc: true
  }
} as const;

// Only the November 18–21 interval is held. Later observations remain live.
export function frozenHistory<T extends {
  records: Array<{ date: string }>;
  tbtcHistory?: Array<{ date: string }>;
  supplyHistory?: Array<{ date: string }>;
}>(history: T): T {
  const cutoff = maintenance.frozenDate;
  if (!history.records.some(point => point.date === cutoff)) {
    throw new Error("The verified November 17, 2026 snapshot is not available in this dataset.");
  }
  const result = structuredClone(history);
  for (const key of ["records", "tbtcHistory", "supplyHistory"] as const) {
    const points = result[key];
    if (!points) continue;
    const baseline = points.filter(point => point.date <= cutoff).at(-1);
    if (!baseline) continue;
    const kept = points.filter(point => point.date <= cutoff || point.date >= maintenance.restartDate);
    const day = new Date(`${cutoff}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    while (day.toISOString().slice(0, 10) < maintenance.restartDate) {
      kept.push({ ...structuredClone(baseline), date: day.toISOString().slice(0, 10) });
      day.setUTCDate(day.getUTCDate() + 1);
    }
    Object.assign(result, { [key]: kept.sort((a, b) => a.date.localeCompare(b.date)) });
  }
  return result;
}
