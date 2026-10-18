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

  const context = `Jupiter Market Depth ${direction} at $${notionalUsd.toFixed(4)}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    // Spread quotes across the keyless 30-request/minute window.
    await delay(2100);
    let response: Response;
    try {
      response = await fetch(`${JUPITER_QUOTE_URL}?${query}`, {
        signal: AbortSignal.timeout(20_000)
      });
    } catch {
      if (attempt === 3) throw new Error(`${context}: network error or timeout after 3 attempts`);
      console.warn(`${context}: network error or timeout; retrying`);
      await delay(5000 * attempt);
      continue;
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 3) {
        throw new Error(`${context}: HTTP ${response.status} (attempt ${attempt}/3)`);
      }
      const retryAfter = response.headers.get("retry-after");
      const reset = response.headers.get("x-ratelimit-reset");
      const retryMs = retryAfter === null ? NaN : /^\d+(\.\d+)?$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
      const resetMs = reset === null ? NaN : Number(reset) * 1000 - Date.now();
      const waitMs = Math.max(
        response.status === 429 ? 60_000 : 5000 * attempt,
        Number.isFinite(retryMs) ? retryMs : 0,
        Number.isFinite(resetMs) ? resetMs : 0
      );
      console.warn(`${context}: HTTP ${response.status}; retrying in ${Math.ceil(waitMs / 1000)}s`);
      await delay(waitMs);
      continue;
    }
    let quote: JupiterQuoteResponse;
    try {
      quote = (await response.json()) as JupiterQuoteResponse;
    } catch {
      throw new Error(`${context}: invalid JSON response`);
    }
    const priceImpact = Number(quote?.priceImpactPct);
    const outputAmount = Number(quote?.outAmount);
    if (
      typeof quote?.priceImpactPct !== "string" || quote.priceImpactPct.trim() === "" ||
      !Number.isFinite(priceImpact) || !Number.isFinite(outputAmount) || outputAmount <= 0
    ) {
      throw new Error(`${context}: invalid priceImpactPct or outAmount`);
    }
    return priceImpact * 100;
  }
  throw new Error(`${context}: quote attempts exhausted`);
}

function roundCurrency(value: number | null): number | null {
  if (value === null) return null;
  return round(value, 2);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
