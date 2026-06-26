import { DEFILLAMA_COINS_URL, DEXSCREENER_TOKEN_URL, JUPITER_PRICE_URL } from "../utils/constants.js";
import type { HeliusPriceInfo } from "../sources/vaultAssets.js";

export interface PriceQuote {
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
    priceUsd?: string;
    liquidity?: {
      usd?: number;
    };
  }>;
}

interface DefiLlamaResponse {
  coins?: Record<string, { price?: number }>;
}

export async function getTokenPrice(
  mint: string,
  heliusPriceInfo?: HeliusPriceInfo
): Promise<PriceQuote | null> {
  return (
    (await getJupiterPrice(mint)) ??
    getHeliusPrice(heliusPriceInfo) ??
    (await getDexScreenerPrice(mint)) ??
    (await getDefiLlamaPrice(mint))
  );
}

async function getJupiterPrice(mint: string): Promise<PriceQuote | null> {
  const response = await fetch(`${JUPITER_PRICE_URL}?ids=${mint}`);
  if (!response.ok) return null;

  const payload = (await response.json()) as JupiterPriceResponse;
  const priceUsd = payload[mint]?.usdPrice;
  return validPrice(priceUsd) ? { priceUsd, provider: "jupiter" } : null;
}

function getHeliusPrice(priceInfo?: HeliusPriceInfo): PriceQuote | null {
  const priceUsd = priceInfo?.price_per_token;
  return validPrice(priceUsd) ? { priceUsd, provider: "helius" } : null;
}

async function getDexScreenerPrice(mint: string): Promise<PriceQuote | null> {
  const response = await fetch(`${DEXSCREENER_TOKEN_URL}/${mint}`);
  if (!response.ok) return null;

  const payload = (await response.json()) as DexScreenerResponse;
  const pair = (payload.pairs ?? [])
    .filter((item) => validPrice(Number(item.priceUsd)))
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const priceUsd = Number(pair?.priceUsd);

  return validPrice(priceUsd) ? { priceUsd, provider: "dexscreener" } : null;
}

async function getDefiLlamaPrice(mint: string): Promise<PriceQuote | null> {
  const response = await fetch(`${DEFILLAMA_COINS_URL}/current/solana:${mint}`);
  if (!response.ok) return null;

  const payload = (await response.json()) as DefiLlamaResponse;
  const priceUsd = payload.coins?.[`solana:${mint}`]?.price;

  return validPrice(priceUsd) ? { priceUsd, provider: "defillama" } : null;
}

function validPrice(price: unknown): price is number {
  return typeof price === "number" && Number.isFinite(price) && price > 0;
}
