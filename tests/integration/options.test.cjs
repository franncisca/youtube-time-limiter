const { t } = require('../../src/shared/i18n.js');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const { Store, dayKey } = require('../../src/shared/core.js');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function page(language = 'en') {
  class Element extends require('../helpers/fake-dom.cjs').Element {
    textContent = ''; value = '0'; checked = false; disabled = false; hidden = false;
    classList = { toggle() {} }; reportValidity() { return true; }
  }
  const html = fs.readFileSync(path.join(__dirname, '../../src/options/index.html'), 'utf8');
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [`#${match[1]}`, new Element()]));
  const $ = selector => { assert.ok(elements.has(selector), `Unknown HTML element ${selector}`); return elements.get(selector); };
  const presets = [...html.matchAll(/data-minutes="(\d+)"/g)].map(match => Object.assign(new Element(), { dataset: { minutes: match[1] } }));
  $('#mode-daily').checked = true;
  let data = { usage: { language, day: dayKey(Date.now()), watchedMs: 183000, limitMinutes: 5 } }, changed, poll, fail = false;
  const storage = { async get() { return structuredClone(data); }, async set(value) { data = structuredClone(value); changed?.({ usage: { newValue: data.usage } }, 'local'); } };
  const store = new Store(storage); const messages = [];
  const context = vm.createContext({ URL, Date, document: { documentElement: {}, createElement: tag => new Element(tag), querySelector: $, querySelectorAll: selector => selector.startsWith('[data-i18n') ? [] : selector === '[data-minutes]' ? presets : selector === 'input[name="limit-action"]' ? [$('#action-dialog'), $('#action-redirect')] : [$('#mode-daily'), $('#mode-session')] },
    setInterval: fn => { poll = fn; return 1; }, chrome: { runtime: { sendMessage: async message => { messages.push(message); if (fail) throw new Error('Disconnected'); return { state: await store.request(message) }; } },
      storage: { onChanged: { addListener: fn => changed = fn } } },
  });
  for (const file of ['src/shared/i18n.js', 'src/shared/core.js', 'src/options/index.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'), context);
  await flush();
  return { $, presets, messages, get state() { return data.usage; }, fail(value) { fail = value; },
    async poll() { poll(); await flush(); }, async submit() { $('#settings').dispatchEvent(new Event('submit')); await flush(); },
    select(mode) { $('#mode-daily').checked = mode === 'daily'; $('#mode-session').checked = mode === 'session'; $(`#mode-${mode}`).dispatchEvent(new Event('change')); },
  };
}
test('settings render HH:MM:SS; polling preserves drafts; starting a session retains daily total', async () => {
  const p = await page();
  assert.equal(p.$('#usage').textContent, '00:03:03'); assert.equal(p.$('#remaining').textContent, '00:01:57');
  p.select('session'); p.$('#hours').value = '0'; p.$('#minutes').value = '2'; await p.poll();
  assert.equal(p.$('#minutes').value, '2'); assert.equal(p.$('#mode-session').checked, true);
  await p.submit();
  assert.equal(p.state.mode, 'session'); assert.equal(p.state.limitSeconds, 120);
  assert.equal(p.$('#usage').textContent, '00:00:00'); assert.equal(p.$('#daily-total').textContent, '00:03:03');
  assert.match(p.$('#status').textContent, /Started with a full temporary/);
  await p.submit();
  assert.equal(p.messages.filter(m => m.type === 'settings').at(-1).restart, true);
  p.select('daily'); assert.equal(p.$('#minutes').value, 5); p.$('#minutes').value = '2'; await p.submit(); assert.equal(p.$('#usage').textContent, '00:03:03');
  assert.equal(p.$('#limit-state').textContent, "Limit reached"); assert.equal(p.$('#remaining').textContent, '00:00:00');
});
test('settings validate zero/overlarge durations and recover from save errors; presets set full duration', async () => {
  const p = await page(); p.$('#hours').value = '0'; p.$('#minutes').value = '0'; p.$('#seconds').value = '0';
  await p.submit(); assert.match(p.$('#status').textContent, /1 second and 24 hours/);
  assert.equal(p.messages.filter(m => m.type === 'settings').length, 0);
  p.$('#hours').value = '24'; p.$('#seconds').value = '1'; await p.submit();
  assert.equal(p.messages.filter(m => m.type === 'settings').length, 0);
  p.presets.at(-1).dispatchEvent(new Event('click')); assert.equal(p.$('#hours').value, 1); assert.equal(p.$('#seconds').value, 0);
  p.fail(true); await p.submit(); assert.match(p.$('#status').textContent, /Disconnected/); assert.equal(p.$('#controls').disabled, false);
  assert.equal(p.state.limitSeconds, 300); p.fail(false); await p.submit(); assert.equal(p.state.limitSeconds, 3600);
});
test('manual total form sets total rather than adding it, updates remaining and keeps default visible', async () => {
  const p = await page();
  p.$('#total-hours').value = '3'; p.$('#total-minutes').value = '0'; p.$('#total-seconds').value = '0';
  p.$('#correction-form').dispatchEvent(new Event('submit')); await flush();
  assert.equal(p.$('#daily-total').textContent, '03:00:00'); assert.equal(p.$('#remaining').textContent, '00:00:00');
  assert.match(p.$('#time-source').textContent, /Recorded 00:03:03/);
  assert.match(p.$('#default-summary').textContent, /Renews automatically/);
  p.$('#correction-form').dispatchEvent(new Event('submit')); await flush();
  assert.equal(p.$('#daily-total').textContent, '03:00:00');
  p.select('session'); p.$('#hours').value = '1'; p.$('#minutes').value = '0'; p.$('#seconds').value = '0'; await p.submit();
  assert.equal(p.$('#remaining').textContent, '01:00:00'); assert.equal(p.state.dailyLimitSeconds, 300);
  p.select('daily'); assert.equal(p.$('#minutes').value, 5);
});
test('behavior form validates destination, keeps URL drafts, and saves independently of session timer', async () => {
  const p = await page(); p.select('session'); await p.submit(); const startedAt = p.state.session.startedAt;
  p.$('#action-redirect').checked = true; p.$('#action-dialog').checked = false;
  p.$('#action-redirect').dispatchEvent(new Event('change')); assert.equal(p.$('#redirect-fields').hidden, false);
  p.$('#redirect-url').value = 'javascript:alert(1)'; p.$('#behavior-form').dispatchEvent(new Event('submit')); await flush();
  assert.equal(p.messages.filter(m => m.type === 'behavior').length, 0);
  assert.match(p.$('#behavior-status').textContent, /http/);
  p.$('#redirect-url').value = 'https://example.com/calm'; await p.poll();
  assert.equal(p.$('#redirect-url').value, 'https://example.com/calm');
  p.$('#behavior-form').dispatchEvent(new Event('submit')); await flush();
  assert.equal(p.state.limitAction, 'redirect'); assert.equal(p.state.redirectUrl, 'https://example.com/calm');
  assert.equal(p.state.session.startedAt, startedAt);
  p.$('#action-redirect').checked = false; p.$('#action-dialog').checked = true;
  p.$('#action-dialog').dispatchEvent(new Event('change')); p.$('#behavior-form').dispatchEvent(new Event('submit')); await flush();
  assert.equal(p.state.limitAction, 'dialog'); assert.equal(p.$('#redirect-fields').hidden, true);
});
test('exclusion form adds canonical entries, safely displays labels, avoids duplicates and removes rows', async () => {
  const p = await page();
  p.$('#exclusion-video').value = 'https://youtu.be/aaaaaaaaaaa?t=20'; p.$('#exclusion-title').value = '<img src=x onerror=alert(1)>';
  p.$('#exclusion-form').dispatchEvent(new Event('submit')); await flush();
  assert.equal(p.state.excludedVideos.length, 1); assert.equal(p.state.excludedVideos[0].id, 'aaaaaaaaaaa');
  assert.equal(p.$('#exclusion-empty').hidden, true);
  const row = p.$('#exclusion-list').children[0]; assert.match(row.children[0].textContent, /^<img/);
  assert.equal(row.children[0].href, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
  p.$('#exclusion-video').value = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
  p.$('#exclusion-form').dispatchEvent(new Event('submit')); await flush(); assert.equal(p.state.excludedVideos.length, 1);
  await p.poll(); assert.equal(p.$('#exclusion-list').children[0], row);
  row.children[1].click(); await flush(); assert.equal(p.state.excludedVideos.length, 0); assert.equal(p.$('#exclusion-empty').hidden, false);
  p.$('#exclusion-video').value = 'https://youtube.com/@channel'; p.$('#exclusion-form').dispatchEvent(new Event('submit')); await flush();
  assert.match(p.$('#exclusion-status').textContent, /one video URL/); assert.equal(p.state.excludedVideos.length, 0);
});
test('language selection translates live settings, validation and list controls without clearing drafts or restarting', async () => {
  const p = await page('zh-CN'); assert.equal(p.$('#language').value, 'zh-CN'); assert.equal(p.$('#save').textContent, t('ui.save', 'zh-CN'));
  p.select('session'); await p.submit(); const start = p.state.session.startedAt;
  p.$('#minutes').value = '12'; p.$('#redirect-url').value = 'https://example.com/draft';
  p.$('#language').value = 'en'; p.$('#language').dispatchEvent(new Event('change')); await flush();
  assert.equal(p.state.language, 'en'); assert.equal(p.$('#save').textContent, 'Start');
  assert.equal(p.$('#minutes').value, '12'); assert.equal(p.$('#redirect-url').value, 'https://example.com/draft');
  assert.equal(p.state.session.startedAt, start); assert.equal(p.$('#language-status').textContent, 'Language saved');
  assert.equal(/[\u4e00-\u9fff]/.test(p.$('#mode-help').textContent), false);
  p.$('#exclusion-video').value = 'bad'; p.$('#exclusion-form').dispatchEvent(new Event('submit')); await flush();
  assert.equal(p.$('#exclusion-status').textContent, 'Enter a complete YouTube video URL.');
  p.$('#exclusion-video').value = 'aaaaaaaaaaa'; p.$('#exclusion-form').dispatchEvent(new Event('submit')); await flush();
  assert.equal(p.$('#exclusion-list').children[0].children[1].textContent, 'Remove');
  p.$('#language').value = 'zh-CN'; p.$('#language').dispatchEvent(new Event('change')); await flush();
  assert.equal(p.$('#save').textContent, t('ui.start', 'zh-CN')); assert.equal(p.$('#exclusion-list').children[0].children[1].textContent, t('ui.remove', 'zh-CN'));
});
test('settings without a saved language start in English and preserve an explicit Chinese preference', async () => {
  const fresh = await page(null);
  assert.equal(fresh.$('#language').value, 'en'); assert.equal(fresh.$('#save').textContent, 'Save');
  const existing = await page('zh-CN'); assert.equal(existing.$('#save').textContent, t('ui.save', 'zh-CN'));
});
test('domain failures arriving through messaging are translated using the selected language', async () => {
  for (const language of ['en', 'zh-CN']) {
    const p = await page(language);
    p.$('#total-hours').value = '0'; p.$('#total-minutes').value = '0'; p.$('#total-seconds').value = '1';
    p.$('#correction-form').dispatchEvent(new Event('submit')); await flush();
    const text = p.$('#correction-status').textContent;
    assert.ok(text.includes(t('error.correctionBelowTotal', language)));
    assert.equal(text.includes('error.'), false);
    assert.equal(p.state.watchedMs, 183000);
    p.$('#exclusion-video').value = 'bad'; p.$('#exclusion-form').dispatchEvent(new Event('submit')); await flush();
    assert.equal(p.$('#exclusion-status').textContent, t('error.incompleteVideoUrl', language));
  }
});
