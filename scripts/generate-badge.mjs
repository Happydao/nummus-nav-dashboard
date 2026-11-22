import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const HISTORY = new URL('data/history.json', ROOT);
const BADGE = new URL('data/badge.json', ROOT);
const PUBLISHED = new URL('dist/data/badge.json', ROOT);
const ZEC_MINT = 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS';
const nonNegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value) && Number.isFinite(Date.parse(value));
const exactKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).sort().join(',') === [...keys].sort().join(',');

export function validateBadge(badge) {
  if (!exactKeys(badge, ['updatedAt', 'nummus']) || !timestamp(badge.updatedAt) ||
      !exactKeys(badge.nummus, ['priceUsd', 'vaultUsd', 'zecAmount']) ||
      !nonNegative(badge.nummus.priceUsd) || badge.nummus.priceUsd === 0 ||
      !nonNegative(badge.nummus.vaultUsd) || !nonNegative(badge.nummus.zecAmount)) {
    throw new Error('Badge requires a source timestamp and three valid numeric metrics');
  }
  return badge;
}

export function createBadge(history) {
  const latest = Array.isArray(history?.records) ? history.records.at(-1) : null;
  if (!latest || !timestamp(history.generatedAt) || latest.date !== history.generatedAt.slice(0, 10)) {
    throw new Error('Latest snapshot and source timestamp are missing or inconsistent');
  }
  if (latest.collectionIssues?.some(issue => ['marketPrice', 'vaultUsd', 'zecAmount'].includes(issue))) {
    throw new Error('Badge source metrics are incomplete');
  }
  // Never substitute the old tBTC field or an older accumulation-series observation.
  const zec = latest.valuationReport?.pricedAssets?.find(asset => asset.mint === ZEC_MINT);
  if (!zec || !nonNegative(latest.zecAmount) || zec.amount !== latest.zecAmount) {
    throw new Error('Latest ZEC balance is not verified for the configured Solana mint');
  }
  return validateBadge({
    updatedAt: history.generatedAt,
    nummus: { priceUsd: latest.marketPrice, vaultUsd: latest.vaultUsd, zecAmount: latest.zecAmount }
  });
}

async function atomicWrite(path, content) {
  const target = path instanceof URL ? path : pathToFileURL(path);
  const temporary = new URL(`${target.href}.${process.pid}.tmp`);
  await mkdir(dirname(fileURLToPath(target)), { recursive: true });
  try {
    await writeFile(temporary, content);
    await rename(temporary, target);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

export async function generateBadge({ sourcePath = HISTORY, badgePath = BADGE } = {}) {
  const badge = createBadge(JSON.parse(await readFile(sourcePath, 'utf8')));
  let previousText, previous;
  try { previousText = await readFile(badgePath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previousText !== undefined) {
    try { previous = validateBadge(JSON.parse(previousText)); }
    catch { /* A corrupt old badge may be replaced only by the verified source above. */ }
  }
  if (previous && Date.parse(previous.updatedAt) > Date.parse(badge.updatedAt)) {
    throw new Error('Refusing to replace a newer badge with older source data');
  }
  const content = `${JSON.stringify(badge)}\n`;
  if (Buffer.byteLength(content) >= 500) throw new Error('Badge exceeds compact size limit');
  if (JSON.stringify(previous) !== JSON.stringify(badge)) await atomicWrite(badgePath, content);
  return badge;
}

export async function publishBadge({ badgePath = BADGE, outputPath = PUBLISHED } = {}) {
  const badge = validateBadge(JSON.parse(await readFile(badgePath, 'utf8')));
  await atomicWrite(outputPath, `${JSON.stringify(badge)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const task = args.length === 0 ? generateBadge() : args.length === 1 && args[0] === '--publish'
    ? publishBadge() : Promise.reject(new Error('Usage: node scripts/generate-badge.mjs [--publish]'));
  task.catch(error => {
    console.error(`Badge feed unavailable; dashboard processing may continue. ${error.message}`);
    process.exitCode = 1;
  });
}
