import { DEXSCREENER_TOKEN_URL, JUPITER_PRICE_URL } from "./constants.js";
import { DefiLlamaPriceClient } from "./defillama.js";

export interface HeliusPriceInfo {
  price_per_token?: number;
  total_price?: number;
}

export interface TreasuryPriceQuote {
  mint: string;
  priceUsd: number;
  provider: "jupiter" | "helius" | "dexscreener" | "defillama";
}

interface JupiterPriceResponse {
  [mint: string]: {
    usdPrice?: number;
  };
}

interface DexScreenerResponse {
  pairs?: Array<{
    pairAddress: string;
    priceUsd?: string;
    liquidity?: {
      usd?: number;
    };
  }>;
}

export class TreasuryPriceClient {
  constructor(private readonly defillama = new DefiLlamaPriceClient()) {}

  async getPrice(mint: string, heliusPriceInfo?: HeliusPriceInfo): Promise<TreasuryPriceQuote | null> {
    return (
      (await this.getJupiterPrice(mint)) ??
      this.getHeliusPrice(mint, heliusPriceInfo) ??
      (await this.getDexScreenerPrice(mint)) ??
      (await this.getDefiLlamaPrice(mint))
    );
  }

  private async getJupiterPrice(mint: string): Promise<TreasuryPriceQuote | null> {
    const response = await fetch(`${JUPITER_PRICE_URL}?ids=${mint}`);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as JupiterPriceResponse;
    const priceUsd = payload[mint]?.usdPrice;
    return validPrice(priceUsd) ? { mint, priceUsd, provider: "jupiter" } : null;
  }

  private getHeliusPrice(
    mint: string,
    priceInfo?: HeliusPriceInfo
  ): TreasuryPriceQuote | null {
    const priceUsd = priceInfo?.price_per_token;
    return validPrice(priceUsd) ? { mint, priceUsd, provider: "helius" } : null;
  }

  private async getDexScreenerPrice(mint: string): Promise<TreasuryPriceQuote | null> {
    const response = await fetch(`${DEXSCREENER_TOKEN_URL}/${mint}`);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as DexScreenerResponse;
    const mostLiquidPair = (payload.pairs ?? [])
      .filter((pair) => validPrice(Number(pair.priceUsd)))
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

    const priceUsd = Number(mostLiquidPair?.priceUsd);
    return validPrice(priceUsd) ? { mint, priceUsd, provider: "dexscreener" } : null;
  }

  private async getDefiLlamaPrice(mint: string): Promise<TreasuryPriceQuote | null> {
    const prices = await this.defillama.getCurrentPrices([`solana:${mint}`]);
    const price = prices.get(`solana:${mint}`);
    return price ? { mint, priceUsd: price.priceUsd, provider: "defillama" } : null;
  }
}

function validPrice(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}
