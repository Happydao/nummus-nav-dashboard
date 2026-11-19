// Release only after the community confirms the restart date.
export const maintenance = {
  enabled: true,
  frozenDate: "2026-11-17",
  nextAsset: {
    symbol: "ZEC",
    mint: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
    wallet: "HtT3yMsAavLQYmd6VSbXSdbAefyZUrrFeEPoTPivde3s",
    excludeTbtc: true
  }
} as const;

// Repeated points are display-only holds, never new collected observations.
export function frozenHistory<T extends {
  records: Array<{ date: string }>;
  tbtcHistory?: Array<{ date: string }>;
  supplyHistory?: Array<{ date: string }>;
}>(history: T, today = new Date().toISOString().slice(0, 10)): T {
  if (!maintenance.enabled) return history;
  const cutoff = maintenance.frozenDate;
  if (!history.records.some(point => point.date === cutoff)) {
    throw new Error("Dashboard under maintenance. The verified November 17, 2026 snapshot is not available in this dataset.");
  }
  const result = structuredClone(history);
  for (const key of ["records", "tbtcHistory", "supplyHistory"] as const) {
    const points = result[key];
    if (!points) continue;
    const kept = points.filter(point => point.date <= cutoff);
    const baseline = kept.at(-1);
    if (baseline) {
      const day = new Date(`${cutoff}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + 1);
      while (day.toISOString().slice(0, 10) <= today) {
        kept.push({ ...structuredClone(baseline), date: day.toISOString().slice(0, 10) });
        day.setUTCDate(day.getUTCDate() + 1);
      }
    }
    Object.assign(result, { [key]: kept });
  }
  return result;
}
