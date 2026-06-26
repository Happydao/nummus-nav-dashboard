import { DEXSCREENER_TOKEN_URL, JUPITER_PRICE_URL, NUMMUS_MINT } from "../src/utils/constants.js";
import type { CollectionResult, MarketPriceSnapshot } from "../src/utils/types.js";

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

export async function collectPriceHistory(): Promise<CollectionResult<MarketPriceSnapshot[]>> {
  const currentPrice = await fetchCurrentPrice();

  return {
    data: currentPrice ? [currentPrice] : [],
    warnings: [
      {
        metric: "marketPrice",
        message:
          "Jupiter and DexScreener public endpoints expose current NUMMUS pricing, not a guaranteed daily historical candle series. Historical market price needs a candle/trade indexer such as Birdeye, GeckoTerminal, DexScreener charts access, or retained internal snapshots."
      }
    ]
  };
}

async function fetchCurrentPrice(): Promise<MarketPriceSnapshot | null> {
  const jupiter = await fetch(`${JUPITER_PRICE_URL}?ids=${NUMMUS_MINT}`);
  if (jupiter.ok) {
    const payload = (await jupiter.json()) as JupiterPriceResponse;
    const priceUsd = payload[NUMMUS_MINT]?.usdPrice;
    if (typeof priceUsd === "number" && Number.isFinite(priceUsd)) {
      return {
        date: new Date().toISOString().slice(0, 10),
        source: "jupiter-price-v3",
        priceUsd
      };
    }
  }

  const dexScreener = await fetch(`${DEXSCREENER_TOKEN_URL}/${NUMMUS_MINT}`);
  if (!dexScreener.ok) {
    return null;
  }

  const payload = (await dexScreener.json()) as DexScreenerResponse;
  const mostLiquidPair = (payload.pairs ?? [])
    .filter((pair) => pair.priceUsd)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];

  if (!mostLiquidPair?.priceUsd) {
    return null;
  }

  return {
    date: new Date().toISOString().slice(0, 10),
    source: "dexscreener-token-pairs",
    priceUsd: Number(mostLiquidPair.priceUsd),
    pairAddress: mostLiquidPair.pairAddress
  };
}
