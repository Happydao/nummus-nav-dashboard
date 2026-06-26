import { NUMMUS_MINT } from "../utils/constants.js";
import { getTokenPrice } from "../pricing/priceProviders.js";

export async function getCurrentMarketPrice(): Promise<number | null> {
  return (await getTokenPrice(NUMMUS_MINT))?.priceUsd ?? null;
}
