export type IsoDate = string;

export interface HistoryRecord {
  date: IsoDate;
  vaultUsd: number | null;
  supply: number | null;
  marketPrice: number | null;
  nav: number | null;
  backing: number | null;
  premium: number | null;
}

export interface CollectionWarning {
  metric: "vaultUsd" | "supply" | "marketPrice" | "burn" | "history";
  message: string;
}

export interface CollectionResult<T> {
  data: T;
  warnings: CollectionWarning[];
}

export interface SupplySnapshot {
  date: IsoDate;
  slot: number;
  rawAmount: string;
  decimals: number;
  uiAmount: number;
}

export interface BurnEvent {
  signature: string;
  slot: number;
  blockTime: number;
  date: IsoDate;
  rawAmount: string;
  decimals: number;
  amount: number;
}

export interface MarketPriceSnapshot {
  date: IsoDate;
  source: string;
  priceUsd: number;
  pairAddress?: string;
}

export interface VaultValueSnapshot {
  date: IsoDate;
  vaultUsd: number | null;
  source: string | null;
  pricedAssetCount?: number;
  unpricedAssetCount?: number;
}

export interface GeneratedHistory {
  generatedAt: string;
  coverage: {
    from: IsoDate | null;
    to: IsoDate | null;
    recordCount: number;
  };
  warnings: CollectionWarning[];
  burnEvents: BurnEvent[];
  records: HistoryRecord[];
}
