export interface HistoryFile {
  generatedAt: string | null;
  records: DailySnapshot[];
  tbtcHistory?: TbtcSnapshot[];
  tbtcCursor?: TbtcCursor;
  supplyHistory?: SupplySnapshot[];
  supplyCursor?: SupplyCursor;
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
  valuationReport: ValuationReport;
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
