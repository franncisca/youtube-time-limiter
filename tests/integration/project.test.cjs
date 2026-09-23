const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read } = require('../../scripts/paths.cjs');
const { check, extensionFiles } = require('../../scripts/check.cjs');
const { responseFor } = require('../../scripts/prototype-server.cjs');
test('extension entry points resolve after restructure and exclude demo adapters', () => {
  check();
  assert.equal(extensionFiles().some(file => file.startsWith('prototype/')), false);
  assert.equal(read('src/options/index.html').includes('mock-runtime'), false);
  assert.match(read('src/options/index.html'), /<html lang="en">/);
  for (const file of ['prototype/watch.js', 'prototype/mock-runtime.js']) new vm.Script(read(file), { filename: file });
});
test('prototype serves production settings with mock adapter only through the development server', async () => {
  const home = await responseFor('/'); assert.equal(home.status, 200); assert.match(home.body, /base href="\/prototype\/"/);
  const options = await responseFor('/src/options/index.html');
  assert.match(options.body, /mock-runtime.js/); assert.match(options.body, /PROTOTYPE/);
  assert.ok(options.body.indexOf('mock-runtime.js') < options.body.indexOf('src="index.js"'));
  assert.equal((await responseFor('/src/shared/core.js')).status, 200);
  for (const size of [16, 32, 48, 128, 256]) {
    const icon = await responseFor(`/icons/icon-${size}.png`);
    assert.equal(icon.type, 'image/png');
    assert.equal(icon.body.readUInt32BE(16), size);
    assert.equal(icon.body.readUInt32BE(20), size);
  }
  for (const file of ['/.git/config', '/README.md', '/prototype/..%2f..%2fREADME.md', '/src/..%2fREADME.md', '/prototype/missing.js']) assert.equal((await responseFor(file)).status, 404, file);
});
