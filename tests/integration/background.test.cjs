const { test } = require('node:test');
const assert = require('node:assert/strict');

const { storage } = require('../helpers/storage.cjs');

test('background message adapter uses async responses and shared storage', async () => {
  const vm = require('node:vm'), fs = require('node:fs'); let listener, clicked, opened = false;
  const context = vm.createContext({ URL, chrome: { storage: { local: storage() },
    runtime: { id: 'test', onMessage: { addListener: fn => listener = fn }, openOptionsPage: () => opened = true },
    action: { onClicked: { addListener: fn => clicked = fn } },
  }});
  context.importScripts = file => vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../src/background', file), 'utf8'), context);
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../../src/background/service-worker.js'), 'utf8'), context);
  const call = message => new Promise(resolve => assert.equal(listener(message, { id: 'test' }, resolve), true));
  assert.equal((await call({ type: 'limit', minutes: 25 })).state.limitMinutes, 25);
  assert.match((await call({ type: 'limit', minutes: -1 })).error, /Limit/);
  assert.equal((await call({ type: 'status' })).state.limitMinutes, 25);
  assert.equal(listener({ type: 'status' }, { id: 'foreign' }, () => assert.fail()), undefined);
  assert.equal((await call({ type: 'open-settings' })).ok, true); assert.equal(opened, true);
  opened = false; clicked(); assert.equal(opened, true);
});
