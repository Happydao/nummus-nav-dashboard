import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAlert, sendTelegram } from '../scripts/notify-telegram.mjs';
const history = issues => ({ records: [{ date: '2026-10-18', collectionIssues: issues }] });
const url = 'https://github.com/Happydao/nummus-nav-dashboard/actions/runs/123';

test('healthy collection stays silent', () => assert.equal(buildAlert(history([]), 'success', 'success', url), null));
test('depth-only outage alerts without naming healthy NAV', () => {
  const text = buildAlert(history(['marketDepth']), 'success', 'success', url);
  assert.match(text, /Market Depth/);
  assert.doesNotMatch(text, /• NAV/);
  assert.ok(text.includes(url));
});
test('missing price alerts all dependent metrics once', () => {
  const text = buildAlert(history(['marketPrice', 'marketDepth']), 'success', 'success', url);
  for (const label of ['Prezzo NUMMUS', 'Treasury Backing', 'Premium vs NAV', 'Market Depth']) assert.ok(text.includes(label));
  assert.equal(text.match(/Market Depth/g).length, 1);
  assert.doesNotMatch(text, /• NAV/);
});
test('failed collection does not report stale issues as current', () => {
  const text = buildAlert(history(['marketDepth']), 'failure', 'skipped', url);
  assert.match(text, /raccolta fallita/);
  assert.doesNotMatch(text, /Market Depth/);
});
test('commit failure is explicit even with healthy metrics', () => assert.match(buildAlert(history([]), 'success', 'failure', url), /Salvataggio su GitHub fallito/));
test('Telegram POST targets configured chat', async () => {
  await sendTelegram('test-token', '123', 'Alert', async (endpoint, init) => {
    assert.equal(endpoint, 'https://api.telegram.org/bottest-token/sendMessage');
    assert.deepEqual(JSON.parse(init.body), { chat_id: '123', text: 'Alert', link_preview_options: { is_disabled: true } });
    return Response.json({ ok: true });
  });
});
test('transport errors never expose token', async () => {
  await assert.rejects(sendTelegram('secret-token', '123', 'Alert', async () => { throw new Error('https://api.telegram.org/botsecret-token'); }), error => !error.message.includes('secret-token'));
});
test('Telegram API rejection fails delivery', async () => {
  await assert.rejects(sendTelegram('token', '123', 'Alert', async () => Response.json({ ok: false }, { status: 403 })), /HTTP 403/);
});
