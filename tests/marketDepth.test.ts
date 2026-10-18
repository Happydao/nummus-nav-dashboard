import assert from "node:assert/strict";
import { test } from "node:test";
import { collectMarketDepth } from "../collector/sources/marketDepth.js";

for (const scenario of ["429 recovers", "429 persists", "503 recovers", "network recovers", "401", "invalid quote"]) {
  test(scenario, async (t) => {
    const waits: number[] = [];
    t.mock.method(globalThis, "setTimeout", ((fn: () => void, ms: number) => {
      waits.push(ms);
      queueMicrotask(fn);
      return 0;
    }) as unknown as typeof setTimeout);
    t.mock.method(console, "warn", () => {});
    let calls = 0;
    const urls: string[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      calls++;
      // Reproduce the supplied log: the fifth quote (buy $160) fails.
      if (calls >= 5) {
        if (scenario === "429 persists" || (scenario === "429 recovers" && calls === 5)) {
          return new Response(null, { status: 429, headers: { "retry-after": "75", "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 90) } });
        }
        if (scenario === "503 recovers" && calls === 5) return new Response(null, { status: 503 });
        if (scenario === "network recovers" && calls === 5) throw new TypeError("fetch failed");
        if (scenario === "401") return new Response(null, { status: 401 });
        if (scenario === "invalid quote") return Response.json({ priceImpactPct: "", outAmount: "1" });
      }
      const usd = Number(new URL(url).searchParams.get("amount")) / 1e6;
      return Response.json({ priceImpactPct: String(usd / 10000), outAmount: "1000000" });
    });
    if (scenario.endsWith("recovers")) {
      const result = await collectMarketDepth(1);
      assert.equal(result.buyDepthUsd, 100);
      assert.equal(result.sellDepthUsd, 100);
      assert.equal(urls[4], urls[5], "retry must quote the same amount");
      assert.ok(waits.filter((ms) => ms === 2100).length === calls);
      if (scenario.startsWith("429")) assert.ok(waits.some((ms) => ms >= 89000));
    } else {
      await assert.rejects(collectMarketDepth(1), scenario === "429 persists"
        ? /buy.*HTTP 429.*attempt 3/ : scenario === "401" ? /buy.*HTTP 401/ : /invalid priceImpactPct/);
      assert.equal(calls, scenario === "429 persists" ? 7 : 5);
    }
  });
}
