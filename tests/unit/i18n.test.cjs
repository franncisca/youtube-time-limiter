const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { t, en } = require('../../src/shared/i18n.js');
const { Store, normalize } = require('../../src/shared/core.js');
test('all Chinese UI strings, placeholders, accessibility labels and domain errors have English translations', () => {
  const missing = new Set();
  for (const file of ['src/options/index.html', 'src/options/index.js', 'src/content/overlay.js', 'src/content/index.js', 'src/shared/core.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');
    const matches = file.endsWith('.html') ? [...source.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g)] : [...source.matchAll(/'([^'\n]*[\u4e00-\u9fff][^'\n]*)'/g)];
    for (const match of matches) {
      const key = match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#x27;', "'");
      if (!en[key]) missing.add(`${file}: ${key}`);
    }
  }
  assert.deepEqual([...missing], []);
  for (const [key, value] of Object.entries(en)) {
    assert.equal(/[\u4e00-\u9fff]/.test(value), false, key);
    assert.deepEqual([...key.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), [...value.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), key);
  }
  assert.equal(t('剩余 {time}', 'en', { time: '00:10:00' }), '00:10:00 left');
});
test('English is default; language persists without changing usage, limits or session start', async () => {
  let data = {}; const store = new Store({ get: async () => structuredClone(data), set: async value => data = structuredClone(value) });
  assert.equal(normalize(null, Date.now()).language, 'en');
  assert.equal(normalize({ language: 'zh-CN' }, Date.now()).language, 'zh-CN');
  const before = await store.request({ type: 'settings', mode: 'session', limitSeconds: 120 });
  const after = await store.request({ type: 'language', language: 'en' });
  assert.deepEqual({ ...after, language: before.language }, before);
  assert.equal((await store.request({ type: 'status' })).language, 'en');
  await assert.rejects(store.request({ type: 'language', language: 'fr' }));
  assert.equal((await store.request({ type: 'language', language: 'zh-CN' })).language, 'zh-CN');
});
