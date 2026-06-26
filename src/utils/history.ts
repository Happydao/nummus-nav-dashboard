export interface DailySnapshot {
  date: string;
  vaultUsd: number | null;
  supply: number | null;
  marketPrice: number | null;
  nav: number | null;
  backing: number | null;
  premium: number | null;
  valuationReport?: {
    pricedAssets: unknown[];
    ignoredAssets: unknown[];
    unpricedAssets: unknown[];
  };
}

export interface HistoryFile {
  generatedAt: string | null;
  records: DailySnapshot[];
}

export async function loadHistory(): Promise<HistoryFile> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/history.json?t=${Date.now()}`);
  if (!response.ok) {
    return { generatedAt: null, records: [] };
  }

  return (await response.json()) as HistoryFile;
}

export function latestRecord(records: DailySnapshot[]): DailySnapshot | null {
  return records.at(-1) ?? null;
}
