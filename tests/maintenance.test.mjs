import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { frozenHistory } from '../src/utils/maintenance.ts';

const history = JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url)));
test('closed pause holds only November 18–21; post-restart observations are untouched', () => {
  const source = structuredClone(history);
  const cutoff = source.records.find(p => p.date === '2026-11-17');
  const live = { ...cutoff, date: '2026-11-22', tbtcAmount: null, zecAmount: 180, vaultUsd: 75000 };
  source.records = [...source.records.filter(p => p.date < '2026-11-22'), live];
  source.zecHistory = [{ date: live.date, amount: 180 }];
  source.supplyHistory.push({ date: live.date, supply: 97000000 });
  const original = structuredClone(source);
  const frozen = frozenHistory(source);
  for (const key of ['records', 'tbtcHistory', 'supplyHistory']) {
    assert.deepEqual(frozen[key].filter(p => p.date <= '2026-11-17'), source[key].filter(p => p.date <= '2026-11-17'));
    const baseline = source[key].filter(p => p.date <= '2026-11-17').at(-1);
    const repeats = frozen[key].filter(p => p.date > '2026-11-17' && p.date < '2026-11-22');
    assert.equal(repeats.length, 4);
    for (const point of repeats) assert.deepEqual(point, { ...baseline, date: point.date });
    assert.deepEqual(frozen[key].filter(p => p.date >= '2026-11-22'), source[key].filter(p => p.date >= '2026-11-22'));
  }
  assert.deepEqual(frozen.zecHistory, source.zecHistory);
  assert.deepEqual(source, original);
  assert.deepEqual(frozenHistory(frozen), frozen);
});
test('missing cutoff cannot silently freeze another date', () => {
  assert.throws(() => frozenHistory({ records: [{ date: '2026-11-16' }] }), /not available/);
});
