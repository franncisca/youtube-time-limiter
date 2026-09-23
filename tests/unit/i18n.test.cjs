const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { t, en } = require('../../src/shared/i18n.js');
const { Store, normalize } = require('../../src/shared/core.js');
test('message IDs, error codes and placeholders resolve in both languages; application code has no Chinese copy', () => {
  const { messages } = require('../../src/shared/i18n.js');
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages['zh-CN']).sort());
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
  for (const file of walk(path.join(__dirname, '../../src'))) {
    if (file.endsWith('/i18n.js')) continue;
    const source = fs.readFileSync(file, 'utf8');
    assert.equal(/\p{Script=Han}/u.test(source), false, file);
    for (const [, key] of source.matchAll(/['"]((?:ui|error)\.[A-Za-z0-9]+)['"]/g)) {
      for (const language of ['en', 'zh-CN']) assert.ok(messages[language][key], `${file}: ${language}: ${key}`);
    }
    for (const [, key] of source.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g)) assert.ok(en[key], key);
  }
  for (const [key, value] of Object.entries(en)) {
    assert.equal(/\p{Script=Han}/u.test(value), false, key);
    assert.deepEqual([...value.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), [...messages['zh-CN'][key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), key);
  }
  assert.equal(t('ui.remainingTime', 'en', { time: '00:10:00' }), '00:10:00 left');
  assert.equal(t('ui.save', 'fr'), 'Save');
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
