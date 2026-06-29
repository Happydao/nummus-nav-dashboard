import { NUMMUS_MINT, USDC_MINT } from "../utils/constants.js";
import { round } from "../utils/math.js";

const JUPITER_QUOTE_URL = "https://lite-api.jup.ag/swap/v1/quote";
const NUMMUS_DECIMALS = 6;
const USDC_DECIMALS = 6;
const TARGET_PRICE_IMPACT_PCT = 1;
const START_NOTIONAL_USD = 10;
const MIN_NOTIONAL_USD = 0.1;
const MAX_NOTIONAL_USD = 1_000_000;
const BINARY_SEARCH_STEPS = 10;

interface JupiterQuoteResponse {
  priceImpactPct?: string;
  outAmount?: string;
}

export interface MarketDepth {
  buyDepthUsd: number | null;
  sellDepthUsd: number | null;
  priceImpactPct: number;
  provider: "jupiter";
}

export async function collectMarketDepth(marketPrice: number | null): Promise<MarketDepth> {
  if (marketPrice === null || !Number.isFinite(marketPrice) || marketPrice <= 0) {
    return emptyMarketDepth();
  }

  const buyDepthUsd = await findDepthUsd("buy", marketPrice);
  const sellDepthUsd = await findDepthUsd("sell", marketPrice);

  return {
    buyDepthUsd: roundCurrency(buyDepthUsd),
    sellDepthUsd: roundCurrency(sellDepthUsd),
    priceImpactPct: TARGET_PRICE_IMPACT_PCT,
    provider: "jupiter"
  };
}

function emptyMarketDepth(): MarketDepth {
  return {
    buyDepthUsd: null,
    sellDepthUsd: null,
    priceImpactPct: TARGET_PRICE_IMPACT_PCT,
    provider: "jupiter"
  };
}

async function findDepthUsd(direction: "buy" | "sell", marketPrice: number): Promise<number | null> {
  const start = await quoteAtNotional(direction, START_NOTIONAL_USD, marketPrice);
  if (start === null) return null;

  let lowerUsd: number;
  let upperUsd: number;

  if (start <= TARGET_PRICE_IMPACT_PCT) {
    lowerUsd = START_NOTIONAL_USD;
    upperUsd = START_NOTIONAL_USD * 2;

    while (upperUsd <= MAX_NOTIONAL_USD) {
      const impact = await quoteAtNotional(direction, upperUsd, marketPrice);
      if (impact === null || impact > TARGET_PRICE_IMPACT_PCT) break;
      lowerUsd = upperUsd;
      upperUsd *= 2;
    }

    if (upperUsd > MAX_NOTIONAL_USD) {
      return MAX_NOTIONAL_USD;
    }
  } else {
    upperUsd = START_NOTIONAL_USD;
    lowerUsd = START_NOTIONAL_USD / 2;

    while (lowerUsd >= MIN_NOTIONAL_USD) {
      const impact = await quoteAtNotional(direction, lowerUsd, marketPrice);
      if (impact !== null && impact <= TARGET_PRICE_IMPACT_PCT) break;
      upperUsd = lowerUsd;
      lowerUsd /= 2;
    }

    if (lowerUsd < MIN_NOTIONAL_USD) return null;
  }

  for (let step = 0; step < BINARY_SEARCH_STEPS; step += 1) {
    const midpointUsd = (lowerUsd + upperUsd) / 2;
    const impact = await quoteAtNotional(direction, midpointUsd, marketPrice);
    if (impact !== null && impact <= TARGET_PRICE_IMPACT_PCT) {
      lowerUsd = midpointUsd;
    } else {
      upperUsd = midpointUsd;
    }
  }

  return lowerUsd;
}

async function quoteAtNotional(
  direction: "buy" | "sell",
  notionalUsd: number,
  marketPrice: number
): Promise<number | null> {
  const isBuy = direction === "buy";
  const tokenAmount = isBuy ? notionalUsd : notionalUsd / marketPrice;
  const decimals = isBuy ? USDC_DECIMALS : NUMMUS_DECIMALS;
  const amount = Math.max(1, Math.floor(tokenAmount * 10 ** decimals));
  const inputMint = isBuy ? USDC_MINT : NUMMUS_MINT;
  const outputMint = isBuy ? NUMMUS_MINT : USDC_MINT;
  const query = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: "100",
    restrictIntermediateTokens: "true"
  });

  try {
    const response = await fetch(`${JUPITER_QUOTE_URL}?${query}`);
    if (!response.ok) return null;
    const quote = (await response.json()) as JupiterQuoteResponse;
    const priceImpact = Number(quote.priceImpactPct);
    const outputAmount = Number(quote.outAmount);
    if (!Number.isFinite(priceImpact) || !Number.isFinite(outputAmount) || outputAmount <= 0) {
      return null;
    }
    return priceImpact * 100;
  } catch {
    return null;
  }
}

function roundCurrency(value: number | null): number | null {
  if (value === null) return null;
  return round(value, 2);
}
