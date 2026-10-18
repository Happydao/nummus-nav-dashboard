import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const metrics = [
  ['Vault Value', ['vaultUsd']],
  ['NUMMUS Supply', ['supply']],
  ['Prezzo NUMMUS', ['marketPrice']],
  ['NAV', ['vaultUsd', 'supply']],
  ['Treasury Backing', ['vaultUsd', 'supply', 'marketPrice']],
  ['Premium vs NAV', ['vaultUsd', 'supply', 'marketPrice']],
  ['tBTC Accumulation', ['tbtcAmount', 'tbtcHistory']],
  ['Market Depth (acquisto/vendita)', ['marketDepth', 'marketPrice']],
  ['DEX Liquidity', ['dexLiquidity']],
  ['Holder Distribution', ['holderGrowth', 'dexLiquidity']],
  ['Storico burn/supply', ['supplyHistory']]
];

export function buildAlert(history, collectionOutcome, commitOutcome, runUrl) {
  if (collectionOutcome !== 'success') {
    return `🔴 NUMMUS — raccolta fallita\nNessun nuovo snapshot salvato da questa esecuzione. Controllare i log per le fonti non disponibili.\n${runUrl}`;
  }
  if (!history?.records?.length) throw new Error('Missing collection report');
  const latest = history.records.at(-1);
  const issues = new Set(latest.collectionIssues ?? []);
  const affected = metrics.filter(([, deps]) => deps.some(key => issues.has(key)));
  const commitFailed = commitOutcome !== 'success';
  if (!affected.length && !commitFailed) return null;
  const lines = [`⚠️ NUMMUS — aggiornamento ${latest.date}`];
  if (affected.length) {
    lines.push('Metriche non aggiornate o incomplete:', ...affected.map(([label]) => `• ${label}`));
    lines.push('Nessun dato di giorni precedenti viene copiato nella nuova data.');
  }
  lines.push(commitFailed
    ? 'Salvataggio su GitHub fallito: i nuovi dati non sono confermati nel repository.'
    : 'Le metriche disponibili sono state salvate. Pubblicazione della dashboard gestita dal job deploy.');
  lines.push(runUrl);
  return lines.join('\n');
}

export async function sendTelegram(token, chatId, text, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(20_000)
    });
  } catch {
    // Never log transport errors: they can contain the URL with the bot token.
    throw new Error('Telegram notification failed: network error or timeout');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('Telegram returned invalid JSON'); }
  if (!response.ok || result?.ok !== true) {
    throw new Error(`Telegram rejected notification (HTTP ${response.status})`);
  }
}

async function main() {
  const testOnly = process.argv.includes("--test");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    if (testOnly) throw new Error('Telegram test requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID secrets');
    console.warn('::warning::Telegram notifications are inactive: configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID repository secrets');
    return;
  }
  if (testOnly) {
    await sendTelegram(token, chatId, '✅ NUMMUS — test notifiche Telegram riuscito. Questo è un messaggio di prova: nessun errore nei dati è stato simulato.');
    console.log('Telegram test message delivered');
    return;
  }
  const outcome = process.env.COLLECTION_OUTCOME;
  const history = outcome === 'success'
    ? JSON.parse(await readFile(new URL('../data/history.json', import.meta.url), 'utf8')) : null;
  const runUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
  const message = buildAlert(history, outcome, process.env.COMMIT_OUTCOME, runUrl);
  if (!message) { console.log('All metrics updated: no Telegram alert needed'); return; }
  await sendTelegram(token, chatId, message);
  console.log('Telegram alert delivered');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message === 'Missing collection report' || error.message.startsWith('Telegram ')
      ? error.message : 'Unable to prepare Telegram notification');
    process.exitCode = 1;
  });
}
