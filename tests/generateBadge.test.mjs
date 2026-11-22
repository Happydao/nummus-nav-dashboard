import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBadge, generateBadge, publishBadge, validateBadge } from '../scripts/generate-badge.mjs';

const history = JSON.parse(await readFile(new URL('../data/history.json', import.meta.url), 'utf8'));
const latest = history.records.at(-1);

test('badge copies exact current metrics and source timestamp without mutating history', () => {
  const before = structuredClone(history);
  const badge = createBadge(history);
  assert.deepEqual(badge, {
    updatedAt: history.generatedAt,
    nummus: { priceUsd: latest.marketPrice, vaultUsd: latest.vaultUsd, zecAmount: latest.zecAmount }
  });
  assert.deepEqual(history, before);
  assert.ok(Buffer.byteLength(JSON.stringify(badge) + '\n') < 500);
});

test('missing ZEC never falls back to tBTC or an older accumulation history', () => {
  for (const change of [
    record => { delete record.zecAmount; record.tbtcAmount = 999; },
    record => { record.valuationReport.pricedAssets[0].mint = 'legacy-tbtc'; },
    record => { record.valuationReport.pricedAssets[0].amount += 1; }
  ]) {
    const source = structuredClone(history);
    change(source.records.at(-1));
    assert.throws(() => createBadge(source), /ZEC balance/);
  }
});

test('null, missing, invalid or explicitly incomplete metrics are not published as fresh data', () => {
  for (const key of ['marketPrice', 'vaultUsd', 'zecAmount']) {
    const source = structuredClone(history);
    source.records.at(-1)[key] = null;
    assert.throws(() => createBadge(source));
    source.records.at(-1)[key] = NaN;
    assert.throws(() => createBadge(source));
    source.records.at(-1)[key] = latest[key];
    source.records.at(-1).collectionIssues = [key];
    assert.throws(() => createBadge(source), /incomplete/);
  }
  const source = structuredClone(history);
  source.generatedAt = 'invalid';
  assert.throws(() => createBadge(source), /timestamp/);
  source.generatedAt = '2026-11-21T12:00:00Z';
  assert.throws(() => createBadge(source), /timestamp/);
  const valid = createBadge(history);
  assert.throws(() => validateBadge({ ...valid, unexpected: 1 }));
});

test('irrelevant collection issues do not block a badge with verified metrics', () => {
  const source = structuredClone(history);
  source.records.at(-1).collectionIssues = ['marketDepth'];
  assert.deepEqual(createBadge(source), createBadge(history));
});

async function withFiles(task) {
  const directory = await mkdtemp(join(tmpdir(), 'nummus-badge-'));
  const sourcePath = join(directory, 'history.json');
  const badgePath = join(directory, 'badge.json');
  await writeFile(sourcePath, JSON.stringify(history));
  try { await task({ directory, sourcePath, badgePath }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('generation and Pages publication write only badge outputs; repeated generation is identical', () => withFiles(async paths => {
  const inputBefore = await readFile(paths.sourcePath, 'utf8');
  await generateBadge(paths);
  const first = await readFile(paths.badgePath, 'utf8');
  await generateBadge(paths);
  assert.equal(await readFile(paths.badgePath, 'utf8'), first);
  const outputPath = join(paths.directory, 'dist', 'data', 'badge.json');
  await publishBadge({ badgePath: paths.badgePath, outputPath });
  assert.equal(await readFile(outputPath, 'utf8'), first);
  assert.equal(await readFile(paths.sourcePath, 'utf8'), inputBefore);
}));

test('source failure preserves previous badge bytes and timestamp, and the retained feed can still publish', () => withFiles(async paths => {
  await generateBadge(paths);
  const previous = await readFile(paths.badgePath, 'utf8');
  await writeFile(paths.sourcePath, '{invalid-json');
  await assert.rejects(generateBadge(paths));
  assert.equal(await readFile(paths.badgePath, 'utf8'), previous);
  const outputPath = join(paths.directory, 'dist', 'badge.json');
  await publishBadge({ badgePath: paths.badgePath, outputPath });
  assert.equal(await readFile(outputPath, 'utf8'), previous);
}));

test('failed atomic write and older source cannot overwrite an existing valid badge', () => withFiles(async paths => {
  const previous = createBadge(history);
  previous.updatedAt = new Date(Date.parse(history.generatedAt) - 1000).toISOString();
  const content = JSON.stringify(previous) + '\n';
  await writeFile(paths.badgePath, content);
  await mkdir(`${paths.badgePath}.${process.pid}.tmp`);
  await assert.rejects(generateBadge(paths));
  assert.equal(await readFile(paths.badgePath, 'utf8'), content);
  previous.updatedAt = new Date(Date.parse(history.generatedAt) + 1000).toISOString();
  await writeFile(paths.badgePath, JSON.stringify(previous));
  await assert.rejects(generateBadge(paths), /newer badge/);
  assert.deepEqual(JSON.parse(await readFile(paths.badgePath)), previous);
}));
