const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../../src/shared/core.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('default browser timers retain the global receiver on start and disposal', async () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const context = vm.createContext({ performance });
  vm.runInContext(`
    globalThis.calls = [];
    globalThis.setInterval = function (callback, delay) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      calls.push(['start', delay]);
      return 42;
    };
    globalThis.clearInterval = function (id) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      calls.push(['cancel', id]);
    };
  `, context);
  for (const file of ['src/shared/core.js', 'src/content/tracker.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../..', file), 'utf8'), context);
  vm.runInContext(`
    const tracker = new YTLTracker({ findVideo: () => null,
      send: async () => ({ state: YTLCore.normalize(null, Date.now()) }) });
    tracker.start(); tracker.start(); tracker.dispose(); tracker.dispose();
  `, context);
  await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(context.calls)), [['start', 1000], ['cancel', 42]]);
});
