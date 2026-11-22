import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { getCurrentVaultAssets } from '../collector/sources/vaultAssets.ts';
import { valueVault } from '../collector/pricing/valueVault.ts';
import { getTokenPrice } from '../collector/pricing/priceProviders.ts';
import { collectUpdate } from '../collector/collectDailySnapshot.ts';
import { treasuryAccumulationChart } from '../src/charts/treasuryAccumulationChart.ts';
import { ZEC_MINT, TBTC_MINT } from '../collector/utils/constants.ts';
import { frozenHistory } from '../src/utils/maintenance.ts';

const history = frozenHistory(JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url))));
const baseline = history.records.find(r => r.date === '2026-11-17');
const asset = { symbol: 'ZEC', mint: ZEC_MINT, amount: 180 };

test('configured ZEC balance uses on-chain decimals and excludes residual tBTC', async () => {
  const result = await getCurrentVaultAssets({ rpc: async () => ({ items: [
    { id: TBTC_MINT, interface: 'FungibleToken', token_info: { balance: '500', decimals: 8 } },
    { id: ZEC_MINT, interface: 'FungibleToken', token_info: { symbol: 'ZEC', balance: '180000000', decimals: 6 } }
  ] }) });
  assert.deepEqual(result.fungibleAssets, [{ ...asset, heliusPriceInfo: undefined }]);
  await assert.rejects(getCurrentVaultAssets({ rpc: async () => ({ items: [{ id: ZEC_MINT, interface: 'FungibleToken', token_info: { balance: '100' } }] }) }), /no verifiable/);
  await assert.rejects(getCurrentVaultAssets({ rpc: async () => ({ items: [] }) }), /no verifiable/);
});

test('only ZEC contributes to NAV valuation; missing ZEC prices remain unavailable', async () => {
  const called = [];
  const assets = [asset, { symbol: 'tBTC', mint: TBTC_MINT, amount: .00001 }];
  const result = await valueVault(assets, [], async mint => { called.push(mint); return { priceUsd: 400, provider: 'test' }; });
  assert.deepEqual(called, [ZEC_MINT]);
  assert.equal(result.vaultUsd, 72000);
  assert.equal(result.valuationReport.pricedAssets.length, 1);
  const failed = await valueVault(assets, [], async () => null);
  assert.equal(failed.vaultUsd, null);
  assert.equal(failed.valuationReport.unpricedAssets[0].mint, ZEC_MINT);
  assert.equal((await valueVault([], [], async () => { throw new Error('must not fetch'); })).vaultUsd, null);
});

test('price-provider network errors fall through to Helius metadata', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  try { assert.deepEqual(await getTokenPrice(ZEC_MINT, { price_per_token: 400 }), { priceUsd: 400, provider: 'helius' }); }
  finally { globalThis.fetch = original; }
});

test('live ZEC snapshot starts with full holdings, preserves the closed pause and archives tBTC', async () => {
  const h = structuredClone(history);
  const oldTbtc = structuredClone(h.tbtcHistory);
  const oldRecords = structuredClone(h.records);
  const deps = {
    getCurrentVaultAssets: async () => ({ fungibleAssets: [asset], ignoredAssets: [] }),
    getCurrentSupply: async () => 97000000,
    getCurrentMarketPrice: async () => .008,
    getCurrentDexLiquidity: async () => structuredClone(baseline.dexLiquidity),
    valueVault: async () => valueVault([asset], [], async () => ({ priceUsd: 400, provider: 'test' })),
    collectMarketDepth: async () => structuredClone(baseline.marketDepth),
    collectHolderGrowth: async date => ({ snapshot: structuredClone(baseline.holderGrowth), cursor: { date, owners: [] } }),
    collectSupplyHistory: async () => ({ history: [{ date: '2026-11-18', supply: 1, burnedCumulative: 99999999 }, { date: '2026-11-22', supply: 97000000, burnedCumulative: 3000000 }], cursor: { processedSignatures: [], totalBurned: 3000000 } })
  };
  const result = await collectUpdate(h, undefined, deps);
  assert.equal(result.snapshot.zecAmount, 180);
  assert.equal(result.snapshot.tbtcAmount, null);
  assert.equal(result.snapshot.vaultUsd, 72000);
  assert.ok(Math.abs(result.snapshot.nav - 72000 / 97000000) < 1e-8);
  assert.deepEqual(result.snapshot.collectionIssues, []);
  assert.deepEqual(result.history.zecHistory, [{ date: result.snapshot.date, amount: 180 }]);
  assert.deepEqual(result.history.tbtcHistory, oldTbtc);
  assert.deepEqual(result.history.records.filter(p => p.date < '2026-11-22'), oldRecords.filter(p => p.date < '2026-11-22'));
  assert.equal(result.history.supplyHistory.find(p => p.date === '2026-11-18').supply, history.supplyHistory.find(p => p.date === '2026-11-18').supply);
});

test('chart keeps token units separate, plots a single ZEC point at its date and supports ZEC-only ranges', () => {
  const h = structuredClone(history);
  h.records.push({ ...baseline, date: '2026-11-22', tbtcAmount: null, zecAmount: 180 });
  h.zecHistory = [{ date: '2026-11-22', amount: 180 }];
  const html = treasuryAccumulationChart({ history: h, range: 'ALL' });
  const data = JSON.parse(html.match(/class="chart-data">(.*?)<\/script>/s)[1]);
  assert.equal(data.points.at(-1).date, '2026-11-22');
  assert.equal(data.points.at(-1).value, 180);
  assert.equal(data.points.at(-1).series[0].name, 'ZEC accumulation');
  assert.equal(data.points.at(-2).date, '2026-11-21');
  assert.equal(data.points.at(-2).value, baseline.tbtcAmount);
  assert.ok(data.points.slice(0, -1).every(p => p.series[0].name.includes('tBTC')));
  const paths = [...html.matchAll(/class="treasury-series"[^>]*d="([^"]*)"/g)].map(m => m[1]);
  assert.ok(paths[0].includes('L'));
  assert.ok(!paths[1].includes('L')); // No horizontal line across the past for a lone ZEC observation.
  assert.match(html, /treasury-transition/);
  assert.match(html, /tBTC · left axis/);
  assert.match(html, /ZEC · right axis/);
  h.records.push({ ...baseline, date: '2026-11-25', tbtcAmount: null, zecAmount: 190 });
  const recent = treasuryAccumulationChart({ history: h, range: '1D' });
  const recentData = JSON.parse(recent.match(/class="chart-data">(.*?)<\/script>/s)[1]);
  assert.ok(recentData.points.every(p => p.series[0].name === 'ZEC accumulation'));
  assert.ok(!recent.includes('NaN'));
  assert.ok(!recent.includes('Infinity'));
  // Test-only chart preview; no fabricated observations are written to repository data.
  writeFileSync('/tmp/nummus-treasury-preview.svg', html.match(/<svg.*?<\/svg>/s)[0]);
});
