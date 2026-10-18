// Read-only: run with node --import tsx scripts/diagnose-market-depth.mjs
import { readFile } from "node:fs/promises";
import { collectMarketDepth } from "../collector/sources/marketDepth.ts";
import { getCurrentMarketPrice } from "../collector/sources/marketPrice.ts";
import { NUMMUS_MINT } from "../collector/utils/constants.ts";

const originalFetch = globalThis.fetch;
let failedQuotes = 0;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  const isQuote = url.hostname.endsWith("jup.ag") && url.pathname.endsWith("/quote");
  const details = isQuote ? {
    direction: url.searchParams.get("inputMint") === NUMMUS_MINT ? "sell" : "buy",
    amountRaw: url.searchParams.get("amount"),
    endpoint: `${url.origin}${url.pathname}`
  } : { endpoint: `${url.origin}${url.pathname}` };
  try {
    const response = await originalFetch(input, {
      ...options,
      signal: options?.signal ?? AbortSignal.timeout(20_000)
    });
    if (isQuote) {
      let body;
      const raw = await response.clone().text();
      try {
        const json = JSON.parse(raw);
        body = {
          priceImpactPct: json.priceImpactPct,
          outAmount: json.outAmount,
          error: json.error,
          errorCode: json.errorCode,
          message: json.message
        };
      } catch {
        body = raw.slice(0, 1000);
      }
      if (!response.ok) failedQuotes++;
      console.log(JSON.stringify({ ...details, status: response.status,
        retryAfter: response.headers.get("retry-after"),
        rateLimitReset: response.headers.get("x-ratelimit-reset"), body }));
    }
    return response;
  } catch (error) {
    if (isQuote) failedQuotes++;
    console.error(JSON.stringify({ ...details,
      networkError: error.cause?.code ?? error.name }));
    throw error;
  }
};

try {
  let price;
  try {
    price = await getCurrentMarketPrice();
  } catch {
    price = null;
  }
  if (!(price > 0)) {
    const history = JSON.parse(await readFile(new URL("../data/history.json", import.meta.url), "utf8"));
    const last = history.records.at(-1);
    price = last.marketPrice;
    console.log(`Current price unavailable: using historical reference ${price} from ${last.date}. This is only a diagnostic, not a current depth measurement.`);
  } else {
    console.log(`Current NUMMUS price: ${price}`);
  }
  const result = await collectMarketDepth(price);
  console.log("Collector result:", JSON.stringify(result));
  console.log(`HTTP/network quote failures (including recovered retries): ${failedQuotes}`);
  if (!(result.buyDepthUsd > 0) || !(result.sellDepthUsd > 0)) process.exitCode = 1;
} finally {
  globalThis.fetch = originalFetch;
}
