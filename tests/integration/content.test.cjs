const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store, dayKey } = require('../../src/shared/core.js');
const { flush, Video, storage, fixture } = require('../helpers/playback.cjs');

test('SPA navigation stops old video, supports missing video, and reattaches reused elements', async () => {
  const f = fixture(); f.tracker.start(); f.video.play(); f.advance(400); f.tracker.navigationStart(); await f.tick();
  assert.equal((await f.usage()).watchedMs, 400);
  f.tracker.navigationEnd(); await f.tick(); assert.equal((await f.usage()).watchedMs, 1400);
  f.replace(null); f.tracker.navigationEnd(); await f.tick(); assert.equal((await f.usage()).watchedMs, 1400);
  const v = new Video(); v.paused = false; f.replace(v); await f.tick(); await f.tick();
  assert.equal((await f.usage()).watchedMs, 2400); f.tracker.dispose();
});
test('content adapter is singleton, handles route events/storage, and cleans up on pagehide', async () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const document = require('../helpers/fake-dom.cjs').createDocument(), window = new EventTarget(), video = new Video(); let storageListener;
  const location = { pathname: '/', reload() {} }; const timers = new Map(); const disk = storage(); const store = new Store(disk);
  document.querySelector = selector => selector === 'video' ? video : null;
  const context = vm.createContext({ URL, document, window, location, performance, Date,
    setInterval: fn => { timers.set(1, fn); return 1; }, clearInterval: id => timers.delete(id),
    chrome: { runtime: { sendMessage: async m => ({ state: await store.request(m) }) }, storage: { onChanged: {
      addListener: fn => storageListener = fn, removeListener: fn => { assert.equal(fn, storageListener); storageListener = null; },
    }}},
  });
  const run = file => vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../..', file), 'utf8'), context);
  run('src/shared/i18n.js'); run('src/shared/core.js'); run('src/content/tracker.js'); run('src/content/overlay.js'); run('src/content/index.js'); run('src/content/index.js'); await flush();
  assert.equal(timers.size, 1); assert.equal(context.__ytLimiter.video, null);
  document.dispatchEvent(new Event('yt-navigate-start')); location.pathname = '/watch'; document.dispatchEvent(new Event('yt-navigate-finish'));
  assert.equal(context.__ytLimiter.video, video);
  storageListener({ usage: { newValue: { day: dayKey(Date.now()), watchedMs: 0, limitMinutes: 30 } } }, 'local');
  assert.equal(context.__ytLimiter.state.limitMinutes, 30);
  let destination;
  location.replace = url => { assert.equal(video.paused, true); destination = url; };
  video.play();
  storageListener({ usage: { newValue: { day: dayKey(Date.now()), watchedMs: 3600000, limitMinutes: 30, limitAction: 'redirect', redirectUrl: 'https://example.com/calm' } } }, 'local');
  assert.equal(destination, 'https://example.com/calm');
  window.dispatchEvent(new Event('pagehide')); assert.equal(timers.size, 0); assert.equal(storageListener, null); assert.equal(context.__ytLimiter, undefined); assert.equal(document.documentElement.children.length, 0);
});
test('SPA reuse of the same video element switches exemption and report identity without duplicate listeners', async () => {
  const f = fixture(); f.setVideoId('aaaaaaaaaaa'); await f.store.request({ type: 'exclude-add', video: 'aaaaaaaaaaa' });
  f.tracker.start(); await flush(); f.video.play(); await f.tick(1000); assert.equal((await f.usage()).watchedMs, 0);
  const video = f.video; f.setVideoId('bbbbbbbbbbb'); f.tracker.navigationStart(); f.tracker.navigationEnd();
  assert.equal(f.video, video); await f.tick(1000); assert.equal((await f.usage()).watchedMs, 1000);
  assert.equal(f.messages.filter(m => m.type === 'usage').at(-1).videoId, 'bbbbbbbbbbb');
  f.setVideoId('aaaaaaaaaaa'); f.tracker.sync(); await f.tick(1000);
  assert.equal((await f.usage()).watchedMs, 1000); assert.equal(f.timers.size, 1); f.tracker.dispose();
});
