export interface HistoryFile {
  generatedAt: string | null;
  records: DailySnapshot[];
  tbtcHistory?: TbtcSnapshot[];
  tbtcCursor?: TbtcCursor;
  supplyHistory?: SupplySnapshot[];
  supplyCursor?: SupplyCursor;
  holderCursor?: HolderCursor;
}

export interface DailySnapshot {
  date: string;
  vaultUsd: number | null;
  supply: number | null;
  marketPrice: number | null;
  nav: number | null;
  backing: number | null;
  premium: number | null;
  tbtcAmount: number | null;
  marketDepth?: MarketDepth;
  dexLiquidity?: DexLiquidity;
  valuationReport: ValuationReport;
  holderGrowth?: HolderSnapshot;
}

export interface HolderSnapshot {
  holderCount: number;
  newHolders: number | null;
  exitedHolders: number | null;
  concentration: HolderConcentration;
}

export interface HolderConcentration {
  topHolderPct: number;
  top10Pct: number;
  top50Pct: number;
  othersPct: number;
  topHolderAmount: number;
  top10Amount: number;
  top50Amount: number;
  othersAmount: number;
  excludedPoolCount: number;
}

export interface HolderCursor {
  date: string;
  owners: string[];
  baselineDate?: string;
  baselineOwners?: string[];
  poolVaults?: Record<string, string>;
  poolVaultVersion?: number;
}

export interface MarketDepth {
  buyDepthUsd: number | null;
  sellDepthUsd: number | null;
  priceImpactPct: number;
  provider: "jupiter";
}

export interface DexLiquidity {
  totalLiquidityUsd: number | null;
  poolCount: number | null;
  provider: "dexscreener";
  pools: DexLiquidityPool[];
}

export interface DexLiquidityPool {
  pairAddress: string;
  dexId: string;
  pairLabel: string;
  liquidityUsd: number;
  url: string | null;
}

export interface TbtcSnapshot {
  date: string;
  amount: number;
}

export interface TbtcCursor {
  tokenAccounts: string[];
  processedSignatures: string[];
  lastAmount: number;
}

export interface SupplySnapshot {
  date: string;
  supply: number;
  burnedCumulative: number;
}

export interface SupplyCursor {
  processedSignatures: string[];
  totalBurned: number;
}

export interface ValuationReport {
  source: string;
  pricedAssets: PricedAsset[];
  ignoredAssets: IgnoredAsset[];
  unpricedAssets: UnpricedAsset[];
}

export interface PricedAsset {
  symbol: string | null;
  mint: string;
  amount: number;
  priceUsd: number;
  valueUsd: number;
  provider: string;
}

export interface IgnoredAsset {
  symbol: string | null;
  mint: string;
  reason: string;
}

export interface UnpricedAsset {
  symbol: string | null;
  mint: string;
  amount: number;
  reason: string;
}
