const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store, dailyTotal, currentUsage } = require('../../src/shared/core.js');
const { flush, Video, storage, fixture } = require('../helpers/playback.cjs');

test('playing counts elapsed time; play intent, pause, buffer, seek and end do not', async () => {
  const f = fixture(); f.tracker.start(); await flush();
  f.video.paused = false; f.video.emit('play'); await f.tick(); assert.equal((await f.usage()).watchedMs, 0);
  f.video.emit('playing'); await f.tick(1500); assert.equal((await f.usage()).watchedMs, 1500);
  for (const event of ['waiting', 'seeking', 'pause', 'ended', 'emptied', 'error']) {
    f.advance(250); f.video.emit(event); await f.tick(2000);
    const before = (await f.usage()).watchedMs; await f.tick(); assert.equal((await f.usage()).watchedMs, before);
    f.video.play();
  }
  assert.equal((await f.usage()).watchedMs, 3000); f.tracker.dispose();
});
test('initial playing video uses paused property, not pause method', async () => {
  const f = fixture(); f.video.paused = false; f.tracker.start(); await f.tick();
  assert.equal((await f.usage()).watchedMs, 1000); f.tracker.dispose();
});
test('idempotent start/attach; replacement removes listeners; disposal clears timer and flushes once', async () => {
  const f = fixture(); f.tracker.start(); f.tracker.start(); f.tracker.sync(); assert.equal(f.timers.size, 1);
  f.video.play(); await f.tick(); assert.equal(f.messages.filter(m => m.type === 'usage').length, 1);
  const old = f.video; const next = new Video(); f.replace(next); f.tracker.sync();
  old.play(); await f.tick(); assert.equal((await f.usage()).watchedMs, 1000);
  next.play(); f.advance(450); f.tracker.dispose(); f.tracker.dispose(); await flush();
  assert.equal(f.timers.size, 0); assert.equal((await f.usage()).watchedMs, 1450);
  next.play(); await f.tick(); assert.equal((await f.usage()).watchedMs, 1450);
});
test('limit pauses playback, blocks replay, and raising limit allows manual replay', async () => {
  const f = fixture(); await f.store.request({ type: 'limit', minutes: 1 }); f.tracker.start(); await flush(); f.video.play();
  await f.tick(60000); assert.equal(f.video.paused, true); assert.equal((await f.usage()).watchedMs, 60000);
  f.video.play(); assert.equal(f.video.paused, true); await f.tick(); assert.equal((await f.usage()).watchedMs, 60000);
  f.tracker.updateState(await f.store.request({ type: 'limit', minutes: 2 })); f.video.play(); await f.tick();
  assert.equal((await f.usage()).watchedMs, 61000); f.tracker.dispose();
});
test('midnight splits active interval and resets blocked state without autoplay', async () => {
  const f = fixture(new Date(2026, 8, 22, 23, 59, 59, 500).getTime()); f.tracker.start(); f.video.play(); await f.tick(1000);
  assert.equal((await f.usage()).watchedMs, 500); assert.equal((await f.usage()).day, '2026-09-23'); f.tracker.dispose();
  const g = fixture(new Date(2026, 8, 22, 23, 59, 59).getTime());
  await g.disk.set({ usage: { day: '2026-09-22', watchedMs: 60000, limitMinutes: 1 } });
  g.tracker.start(); await flush(); g.video.play(); assert.equal(g.video.paused, true);
  await g.tick(2000); assert.equal((await g.usage()).watchedMs, 0); assert.equal(g.video.paused, true);
  g.video.play(); await g.tick(); assert.equal((await g.usage()).watchedMs, 1000); g.tracker.dispose();
});
test('storage failures are reported and do not poison the queue', async () => {
  const disk = storage(); const set = disk.set.bind(disk); let fail = true;
  disk.set = async value => { if (fail) throw new Error('disk failed'); await set(value); };
  const s = new Store(disk); await assert.rejects(s.request({ type: 'status' }), /disk failed/);
  fail = false; assert.equal((await s.request({ type: 'status' })).limitMinutes, 60);
  const f = fixture(); f.tracker.send = async () => ({ error: 'disconnected' }); f.tracker.start(); await flush();
  assert.equal(f.errors.length, 1); f.tracker.dispose();
});
test('paused video is not polled into playing after a waiting event', async () => {
  const f = fixture(); f.tracker.start(); f.video.play(); await f.tick();
  f.video.emit('waiting'); f.video.readyState = 4; await f.tick(5000);
  assert.equal((await f.usage()).watchedMs, 1000);
  f.video.emit('playing'); await f.tick(2500); assert.equal((await f.usage()).watchedMs, 3500); f.tracker.dispose();
});
test('session limit enforces seconds precision and restart allows manual replay', async () => {
  const f = fixture(); await f.store.request({ type: 'settings', mode: 'session', limitSeconds: 2 });
  f.tracker.start(); await flush(); f.video.play(); await f.tick(); assert.equal(f.video.paused, false);
  await f.tick(); assert.equal(f.video.paused, true);
  f.tracker.updateState(await f.store.request({ type: 'settings', mode: 'session', limitSeconds: 2, restart: true }));
  assert.equal(f.video.paused, true); f.video.play(); await f.tick();
  assert.equal(f.video.paused, false); assert.equal((await f.usage()).session.watchedMs, 1000);
  assert.equal((await f.usage()).watchedMs, 3000); f.tracker.dispose();
});
test('three hours today and one-hour daily default blocks; temporary one-hour allowance is still full', async () => {
  const f = fixture();
  let state = await f.store.request({ type: 'settings', mode: 'daily', limitSeconds: 3600 });
  state = await f.store.request({ type: 'daily-total', day: state.day, totalSeconds: 10800 });
  assert.equal(dailyTotal(state), 10800000); assert.equal(currentUsage(state, new Date(2026, 8, 22, 12).getTime()).remainingMs, 0);
  f.tracker.start(); await flush(); f.video.play(); assert.equal(f.video.paused, true);
  state = await f.store.request({ type: 'settings', mode: 'session', limitSeconds: 3600, restart: true });
  f.tracker.updateState(state);
  assert.equal(currentUsage(state, new Date(2026, 8, 22, 12).getTime()).remainingMs, 3600000);
  assert.equal(state.dailyLimitSeconds, 3600); f.video.play(); await f.tick(); assert.equal(f.video.paused, false);
  assert.equal(dailyTotal(await f.usage()), 10801000); f.tracker.dispose();
});
test('enforcement pauses the video before the limit-action callback can navigate', async () => {
  const f = fixture(); f.tracker.start(); await flush(); f.video.play();
  let callbacks = 0;
  f.tracker.onState = state => { if (state.limitAction === 'redirect') { assert.equal(f.video.paused, true); callbacks++; } };
  const state = await f.store.request({ type: 'behavior', limitAction: 'redirect', redirectUrl: 'https://example.com/calm' });
  state.watchedMs = 3600000; f.tracker.updateState(state);
  assert.equal(callbacks, 1); assert.equal(f.video.paused, true); f.tracker.dispose();
});
test('excluded playback consumes neither daily nor session time; removing exclusion resumes from that moment', async () => {
  const f = fixture(); f.setVideoId('aaaaaaaaaaa');
  await f.store.request({ type: 'settings', mode: 'session', limitSeconds: 60 });
  await f.store.request({ type: 'exclude-add', video: 'aaaaaaaaaaa' });
  f.tracker.start(); await flush(); f.video.play(); await f.tick(5000);
  assert.equal((await f.usage()).watchedMs, 0); assert.equal((await f.usage()).session.watchedMs, 0);
  f.tracker.updateState(await f.store.request({ type: 'exclude-remove', video: 'aaaaaaaaaaa' }));
  await f.tick(1000); assert.equal((await f.usage()).watchedMs, 1000); assert.equal((await f.usage()).session.watchedMs, 1000);
  f.tracker.updateState(await f.store.request({ type: 'exclude-add', video: 'aaaaaaaaaaa' }));
  await f.tick(5000); assert.equal((await f.usage()).watchedMs, 1000); f.tracker.dispose();
});
test('exempt videos bypass an exhausted allowance; removing exemption enforces it without autoplay', async () => {
  const f = fixture(); f.setVideoId('aaaaaaaaaaa');
  const state = await f.store.request({ type: 'status' });
  await f.store.request({ type: 'daily-total', day: state.day, totalSeconds: 3600 });
  await f.store.request({ type: 'exclude-add', video: 'aaaaaaaaaaa' });
  f.tracker.start(); await flush(); f.video.play(); await f.tick(); assert.equal(f.video.paused, false);
  f.tracker.updateState(await f.store.request({ type: 'exclude-remove', video: 'aaaaaaaaaaa' })); assert.equal(f.video.paused, true);
  f.tracker.updateState(await f.store.request({ type: 'exclude-add', video: 'aaaaaaaaaaa' })); assert.equal(f.video.paused, true);
  f.video.play(); assert.equal(f.video.paused, false); f.tracker.dispose();
});
