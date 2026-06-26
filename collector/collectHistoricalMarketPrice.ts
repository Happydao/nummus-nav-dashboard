import { NUMMUS_MINT } from "../src/utils/constants.js";
import { DefiLlamaPriceClient } from "../src/utils/defillama.js";
import type { IsoDate, MarketPriceSnapshot } from "../src/utils/types.js";

export async function collectHistoricalMarketPrice(
  date: IsoDate,
  prices = new DefiLlamaPriceClient()
): Promise<MarketPriceSnapshot | null> {
  const coinId = `solana:${NUMMUS_MINT}`;
  const price = (await prices.getHistoricalPrices(date, [coinId])).get(coinId);

  return price
    ? {
        date,
        source: "defillama-coins-historical",
        priceUsd: price.priceUsd
      }
    : null;
}
