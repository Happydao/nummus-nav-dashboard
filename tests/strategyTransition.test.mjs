import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { lineChart } from '../src/charts/lineChart.ts';
import { dexLiquidityChart } from '../src/charts/dexLiquidityChart.ts';
import { holderConcentrationChart } from '../src/charts/holderConcentrationChart.ts';
import { strategyTransitionMarker } from '../src/charts/strategyTransition.ts';

const baseline = JSON.parse(readFileSync(new URL('../data/history.json', import.meta.url))).records.find(r => r.date === '2026-11-17');
const records = ['2026-11-20', '2026-11-21', '2026-11-23', '2026-11-24'].map(date => ({ ...structuredClone(baseline), date }));
const charts = [
  options => lineChart({ id: 'nav', title: 'NAV', records, key: 'nav', formatter: String, yLabel: 'USD', ...options }),
  options => dexLiquidityChart({ records, ...options }),
  options => holderConcentrationChart({ records: records.map(r => ({ date: r.date, ...r.holderGrowth, ...r.holderGrowth.concentration })), ...options })
];
for (const [index, render] of charts.entries()) {
  test(`historical renderer ${index + 1}: marker follows visible dates and zoom, including missing November 22 observations`, () => {
    const html = render({ range: 'ALL' });
    assert.equal([...html.matchAll(/data-transition-date="2026-11-22"/g)].length, 1);
    const data = JSON.parse(html.match(/class="chart-data">(.*?)<\/script>/s)[1]);
    const before = data.points.find(p => p.date === '2026-11-21');
    const after = data.points.find(p => p.date === '2026-11-23');
    const x = Number(html.match(/class="strategy-transition"[^>]*x1="([^"]+)"/)[1]);
    assert.ok(Math.abs(x - (before.x + after.x) / 2) < .001);
    assert.ok(!render({ range: '1D' }).includes('data-transition-date'));
    assert.ok(!render({ range: 'ALL', zoomWindow: { start: 0, end: .2 } }).includes('data-transition-date'));
  });
}
test('transition on a one-observation domain stays visible at the chart coordinate', () => {
  const html = strategyTransitionMarker([{ date: '2026-11-22', x: 380 }], 22, 266);
  assert.match(html, /x1="380" x2="380"/);
  assert.equal(strategyTransitionMarker([{ date: '2026-11-21', x: 380 }], 22, 266), '');
  assert.equal(strategyTransitionMarker([], 22, 266), '');
});
