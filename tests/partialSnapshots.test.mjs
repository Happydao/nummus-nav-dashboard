import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { collectUpdate } from '../collector/collectDailySnapshot.ts';
import { chartFreshness } from '../src/utils/history.ts';
import { TBTC_MINT } from '../collector/utils/constants.ts';

const fixture = JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url))).records.at(-1);
const fail = async () => { throw new Error('source unavailable'); };
function setup() {
  const baseline = { ...structuredClone(fixture), date: '2026-01-01' };
  const holderState = { date: baseline.date, owners: ['previous'] };
  const history = { generatedAt: '2026-01-01T12:00:00Z', records: [baseline],
    tbtcHistory: [{ date: baseline.date, amount: 1 }], tbtcCursor: { tokenAccounts: [], processedSignatures: ['old'], lastAmount: 1 },
    supplyHistory: [{ date: baseline.date, supply: 100, burnedCumulative: 0 }], supplyCursor: { processedSignatures: ['old'], totalBurned: 0 } };
  const deps = {
    getCurrentVaultAssets: async () => ({ fungibleAssets: [{ mint: TBTC_MINT, amount: fixture.tbtcAmount }], ignoredAssets: [] }),
    getCurrentSupply: async () => fixture.supply,
    getCurrentMarketPrice: async () => fixture.marketPrice,
    getCurrentDexLiquidity: async () => structuredClone(fixture.dexLiquidity),
    valueVault: async () => ({ vaultUsd: fixture.vaultUsd, valuationReport: structuredClone(fixture.valuationReport) }),
    collectMarketDepth: async () => structuredClone(fixture.marketDepth),
    collectTbtcHistory: async (history, cursor) => ({ history, cursor }),
    collectSupplyHistory: async (_, history, cursor) => ({ history, cursor }),
    collectHolderGrowth: async (date) => ({ snapshot: structuredClone(fixture.holderGrowth), cursor: { date, owners: ['new'] } })
  };
  return { history, holderState, deps };
}

test('depth failure publishes other metrics without carrying yesterday forward', async () => {
  const { history, holderState, deps } = setup();
  const previous = structuredClone(history.records[0]);
  deps.collectMarketDepth = fail;
  const update = await collectUpdate(history, holderState, deps);
  assert.equal(update.snapshot.marketDepth, undefined);
  assert.equal(update.snapshot.vaultUsd, fixture.vaultUsd);
  assert.ok(update.snapshot.nav > 0);
  assert.ok(update.snapshot.holderGrowth);
  assert.deepEqual(update.history.records[0], previous);
  assert.ok(update.snapshot.collectionIssues.includes('marketDepth'));
  const freshness = chartFreshness(update.history.records);
  assert.equal(freshness.find(s => s.id === 'market-depth').date, previous.date);
  assert.equal(freshness.find(s => s.id === 'market-depth').delayed, true);
  assert.equal(freshness.find(s => s.id === 'vault').delayed, false);
});

test('vault failure blanks dependent metrics but publishes price, depth and supply', async () => {
  const { history, holderState, deps } = setup();
  deps.getCurrentVaultAssets = fail;
  const { snapshot } = await collectUpdate(history, holderState, deps);
  for (const key of ['vaultUsd', 'nav', 'backing', 'premium']) assert.equal(snapshot[key], null);
  assert.equal(snapshot.marketPrice, fixture.marketPrice);
  assert.ok(snapshot.marketDepth);
  assert.equal(snapshot.supply, fixture.supply);
});

test('failed history and holder scans retain cursors and publish current metrics', async () => {
  const { history, holderState, deps } = setup();
  const before = structuredClone(history);
  deps.collectTbtcHistory = async (_, cursor) => { cursor.processedSignatures.push('bad'); throw new Error('failed scan'); };
  deps.collectSupplyHistory = fail;
  deps.collectHolderGrowth = fail;
  const result = await collectUpdate(history, holderState, deps);
  assert.deepEqual(result.history.tbtcCursor, before.tbtcCursor);
  assert.deepEqual(result.history.supplyCursor, before.supplyCursor);
  assert.deepEqual(result.holderState, holderState);
  assert.equal(result.snapshot.holderGrowth, undefined);
  assert.ok(result.snapshot.nav > 0);
});

test('total outage fails without changing the history or publication time', async () => {
  const { history, holderState, deps } = setup();
  const before = structuredClone(history);
  for (const key of Object.keys(deps)) deps[key] = fail;
  await assert.rejects(collectUpdate(history, holderState, deps), /No valid current metrics/);
  assert.deepEqual(history, before);
});

test('same-day failure preserves earlier depth with an incomplete marker', async () => {
  const { history, holderState, deps } = setup();
  const first = await collectUpdate(history, holderState, deps);
  const depth = structuredClone(first.snapshot.marketDepth);
  deps.collectMarketDepth = fail;
  const second = await collectUpdate(history, first.holderState, deps);
  assert.deepEqual(second.snapshot.marketDepth, depth);
  assert.ok(second.snapshot.collectionIssues.includes('marketDepth'));
  assert.equal(second.history.records.length, 2);
  assert.equal(chartFreshness(second.history.records).find(s => s.id === 'market-depth').delayed, true);
});

test('intraday retry does not reuse NAV with a changed vault and unavailable supply', async () => {
  const { history, holderState, deps } = setup();
  await collectUpdate(history, holderState, deps);
  deps.getCurrentSupply = fail;
  deps.valueVault = async () => ({ vaultUsd: fixture.vaultUsd * 2, valuationReport: structuredClone(fixture.valuationReport) });
  const { snapshot } = await collectUpdate(history, holderState, deps);
  assert.equal(snapshot.nav, null);
  assert.equal(snapshot.backing, null);
  assert.equal(snapshot.premium, null);
});
