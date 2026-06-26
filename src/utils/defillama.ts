import { DEFILLAMA_COINS_URL } from "./constants.js";

interface DefiLlamaCoin {
  decimals?: number;
  symbol?: string;
  price?: number;
  timestamp?: number;
  confidence?: number;
}

interface DefiLlamaPriceResponse {
  coins?: Record<string, DefiLlamaCoin>;
}

export interface AssetPrice {
  coinId: string;
  priceUsd: number;
  timestamp?: number;
  confidence?: number;
}

export class DefiLlamaPriceClient {
  async getCurrentPrices(coinIds: string[]): Promise<Map<string, AssetPrice>> {
    return this.fetchPrices(`${DEFILLAMA_COINS_URL}/current/${coinIds.join(",")}`, coinIds);
  }

  async getHistoricalPrices(date: string, coinIds: string[]): Promise<Map<string, AssetPrice>> {
    const timestamp = Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
    return this.fetchPrices(
      `${DEFILLAMA_COINS_URL}/historical/${timestamp}/${coinIds.join(",")}`,
      coinIds
    );
  }

  private async fetchPrices(url: string, coinIds: string[]): Promise<Map<string, AssetPrice>> {
    if (coinIds.length === 0) {
      return new Map();
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DefiLlama price request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as DefiLlamaPriceResponse;
    const prices = new Map<string, AssetPrice>();
    for (const coinId of coinIds) {
      const coin = payload.coins?.[coinId];
      if (typeof coin?.price === "number") {
        prices.set(coinId, {
          coinId,
          priceUsd: coin.price,
          timestamp: coin.timestamp,
          confidence: coin.confidence
        });
      }
    }

    return prices;
  }
}
