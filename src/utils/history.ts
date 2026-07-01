export interface DailySnapshot {
  date: string;
  vaultUsd: number | null;
  supply: number | null;
  marketPrice: number | null;
  nav: number | null;
  backing: number | null;
  premium: number | null;
  tbtcAmount?: number | null;
  marketDepth?: {
    buyDepthUsd: number | null;
    sellDepthUsd: number | null;
    priceImpactPct: number;
    provider: "jupiter";
  };
  dexLiquidity?: {
    totalLiquidityUsd: number | null;
    poolCount: number | null;
    provider: "dexscreener";
    pools?: Array<{
      pairAddress: string;
      dexId: string;
      pairLabel: string;
      liquidityUsd: number;
      url: string | null;
    }>;
  };
  valuationReport?: {
    source?: string;
    pricedAssets: unknown[];
    ignoredAssets: unknown[];
    unpricedAssets: unknown[];
  };
  holderGrowth?: {
    holderCount: number;
    newHolders: number | null;
    exitedHolders: number | null;
    concentration: {
      topHolderPct: number;
      top10Pct: number;
      top50Pct: number;
      othersPct: number;
      topHolderAmount: number;
      top10Amount: number;
      top50Amount: number;
      othersAmount: number;
      excludedPoolCount: number;
    };
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
