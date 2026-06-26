export interface DailySnapshot {
  date: string;
  vaultUsd: number | null;
  supply: number | null;
  marketPrice: number | null;
  nav: number | null;
  backing: number | null;
  premium: number | null;
  tbtcAmount?: number | null;
  valuationReport?: {
    source?: string;
    pricedAssets: unknown[];
    ignoredAssets: unknown[];
    unpricedAssets: unknown[];
  };
}

export interface HistoryFile {
  generatedAt: string | null;
  records: DailySnapshot[];
  tbtcHistory?: TbtcSnapshot[];
  supplyHistory?: SupplySnapshot[];
}

export interface TbtcSnapshot {
  date: string;
  amount: number;
}

export interface SupplySnapshot {
  date: string;
  supply: number;
  burnedCumulative?: number;
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
