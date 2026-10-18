export interface DailySnapshot {
  collectionIssues?: string[];
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

export function chartFreshness(records: DailySnapshot[]) {
  const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
  const latest = records.at(-1);
  const definitions: Array<[string, string[], (record: DailySnapshot) => boolean]> = [
    ["nav", ["vaultUsd", "supply", "marketPrice"], (r) => positive(r.nav) && positive(r.marketPrice)],
    ["backing", ["vaultUsd", "supply", "marketPrice"], (r) => positive(r.backing)],
    ["premium", ["vaultUsd", "supply", "marketPrice"], (r) => positive(r.premium)],
    ["vault", ["vaultUsd"], (r) => positive(r.vaultUsd)],
    ["vault-drawdown", ["vaultUsd"], (r) => positive(r.vaultUsd)],
    ["supply", ["supply", "supplyHistory"], (r) => positive(r.supply)],
    ["tbtc", ["tbtcAmount", "tbtcHistory"], (r) => typeof r.tbtcAmount === "number" && r.tbtcAmount >= 0],
    ["market-depth", ["marketDepth"], (r) => positive(r.marketDepth?.buyDepthUsd) && positive(r.marketDepth?.sellDepthUsd)],
    ["dex-liquidity", ["dexLiquidity"], (r) => positive(r.dexLiquidity?.totalLiquidityUsd)],
    ["holder-concentration", ["holderGrowth"], (r) => positive(r.holderGrowth?.holderCount)]
  ];
  return definitions.map(([id, dependencies, valid]) => {
    const last = records.filter(valid).at(-1);
    return { id, date: last?.date ?? null,
      delayed: !last || last.date !== latest?.date || dependencies.some((key) => latest?.collectionIssues?.includes(key)) };
  });
}
