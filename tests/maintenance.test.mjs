import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { frozenHistory } from '../src/utils/maintenance.ts';

const history = JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url)));
test('freeze preserves history and repeats every metric from November 17 through future dates', () => {
  const original = structuredClone(history);
  const frozen = frozenHistory(history, '2026-11-25');
  for (const key of ['records', 'tbtcHistory', 'supplyHistory']) {
    assert.deepEqual(frozen[key].filter(p => p.date <= '2026-11-17'), history[key].filter(p => p.date <= '2026-11-17'));
    const baseline = history[key].filter(p => p.date <= '2026-11-17').at(-1);
    const repeats = frozen[key].filter(p => p.date > '2026-11-17');
    assert.equal(repeats.length, 8);
    for (const point of repeats) assert.deepEqual(point, { ...baseline, date: point.date });
  }
  assert.deepEqual(history, original);
  assert.deepEqual(frozenHistory(frozen, '2026-11-25'), frozen);
});
test('missing cutoff cannot silently freeze another date', () => {
  assert.throws(() => frozenHistory({ records: [{ date: '2026-11-16' }] }), /not available/);
});
