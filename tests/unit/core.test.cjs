const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Store, dayKey, redirectURL, videoID, isExcluded, normalize, dailyTotal, currentUsage, formatTime } = require('../../src/shared/core.js');
const { storage } = require('../helpers/storage.cjs');

test('serialized concurrent tab writes survive worker recreation and invalid input', async () => {
  const now = Date.now(), disk = storage(), s = new Store(disk, () => now);
  await Promise.all(Array.from({ length: 30 }, () => s.request({ type: 'usage', start: now - 1000, end: now, elapsed: 1000 })));
  assert.equal((await new Store(disk, () => now).request({ type: 'status' })).watchedMs, 30000);
  await assert.rejects(s.request({ type: 'limit', minutes: 0 }));
  await assert.rejects(s.request({ type: 'usage', start: now, end: now - 1, elapsed: 1 }));
  const result = await s.request({ type: 'limit', minutes: 90 }); assert.equal(result.limitMinutes, 90); assert.equal(result.watchedMs, 30000);
});
test('corrupt data recovers and day keys use local dates', () => {
  const now = new Date(2026, 0, 2, 0, 1).getTime(); assert.equal(dayKey(now), '2026-01-02');
  assert.deepEqual(normalize({ day: dayKey(now), watchedMs: NaN, limitMinutes: -1 }, now), { language: 'en', excludedVideos: [], limitAction: 'dialog', redirectUrl: '', day: dayKey(now), watchedMs: 0, limitMinutes: 60, limitSeconds: 3600, dailyLimitSeconds: 3600, sessionLimitSeconds: 3600, manualMs: 0, mode: 'daily', session: null });
});
test('storage is not rewritten by idle status polling', async () => {
  const disk = storage(), s = new Store(disk); await s.request({ type: 'status' });
  await s.request({ type: 'status' }); assert.equal(disk.writes, 1);
});
test('legacy totals and limits migrate without clearing recorded daily use', async () => {
  const now = new Date(2026, 8, 22, 12).getTime();
  const store = new Store(storage({ day: dayKey(now), watchedMs: 180000, limitMinutes: 2 }), () => now);
  const state = await store.request({ type: 'status' });
  assert.equal(state.watchedMs, 180000); assert.equal(state.limitSeconds, 120);
  assert.equal(state.mode, 'daily'); assert.equal(currentUsage(state, now).blocked, true);
});
test('new session ignores earlier daily usage and restart clips delayed in-flight intervals', async () => {
  let now = new Date(2026, 8, 22, 12).getTime();
  const store = new Store(storage({ day: dayKey(now), watchedMs: 180000, limitMinutes: 2 }), () => now);
  let state = await store.request({ type: 'settings', mode: 'session', limitSeconds: 120 });
  assert.equal(state.watchedMs, 180000); assert.equal(currentUsage(state, now).watchedMs, 0);
  assert.equal(currentUsage(state, now).blocked, false);
  const start = now; now += 1000;
  state = await store.request({ type: 'usage', start: start - 1000, end: now, elapsed: 2000 });
  assert.equal(state.session.watchedMs, 1000); assert.equal(state.watchedMs, 182000);
  now += 500; await store.request({ type: 'settings', mode: 'session', limitSeconds: 120, restart: true });
  now += 500;
  state = await store.request({ type: 'usage', start: start + 1000, end: now, elapsed: 1000 });
  assert.equal(state.session.watchedMs, 500); assert.equal(state.watchedMs, 183000);
  state = await store.request({ type: 'usage', start, end: start + 100, elapsed: 100 });
  assert.equal(state.session.watchedMs, 500);
});
test('daily default persists across midnight and worker restart; temporary override expires automatically', async () => {
  let now = new Date(2026, 8, 22, 23, 59, 59, 500).getTime(); const disk = storage(); const s = new Store(disk, () => now);
  await s.request({ type: 'settings', mode: 'daily', limitSeconds: 3600 });
  await s.request({ type: 'settings', mode: 'session', limitSeconds: 90, restart: true });
  const start = now; now += 1000;
  let state = await s.request({ type: 'usage', start, end: now, elapsed: 1000 });
  assert.equal(state.watchedMs, 500); assert.equal(state.session, null); assert.equal(state.mode, 'daily');
  state = await new Store(disk, () => now).request({ type: 'status' });
  assert.equal(state.dailyLimitSeconds, 3600); assert.equal(state.sessionLimitSeconds, 90);
  assert.equal(currentUsage(state, now).remainingMs, 3599500);
});
test('HH:MM:SS formatting, remaining-time clamp and settings boundaries', async () => {
  assert.equal(formatTime(0), '00:00:00'); assert.equal(formatTime(3661999), '01:01:01');
  assert.equal(formatTime(86400000), '24:00:00'); assert.equal(formatTime(-1), '00:00:00');
  const s = new Store(storage());
  for (const seconds of [0, -1, 86401, 1.5, '60', NaN]) await assert.rejects(s.request({ type: 'settings', mode: 'daily', limitSeconds: seconds }));
  await assert.rejects(s.request({ type: 'settings', mode: 'invalid', limitSeconds: 60 }));
  await assert.rejects(s.request({ type: 'settings', mode: 'session', limitSeconds: 60, restart: 'true' }));
  assert.equal((await s.request({ type: 'settings', mode: 'daily', limitSeconds: 86400 })).limitSeconds, 86400);
  const state = await s.request({ type: 'settings', mode: 'daily', limitSeconds: 1 }); state.watchedMs = 1500;
  assert.equal(currentUsage(state).remainingMs, 0); assert.equal(currentUsage(state).blocked, true);
});
test('daily and temporary limits are independent; switching to daily applies the existing total', async () => {
  const now = Date.now(), s = new Store(storage({ day: dayKey(now), watchedMs: 7200000, limitMinutes: 60 }), () => now);
  await s.request({ type: 'settings', mode: 'session', limitSeconds: 900, restart: true });
  let state = await s.request({ type: 'status' });
  assert.equal(state.dailyLimitSeconds, 3600); assert.equal(state.sessionLimitSeconds, 900);
  assert.equal(currentUsage(state, now).remainingMs, 900000);
  state = await s.request({ type: 'settings', mode: 'daily', limitSeconds: 3600 });
  assert.equal(currentUsage(state, now).blocked, true); assert.equal(state.sessionLimitSeconds, 900);
});
test('manual total is idempotent, retains automatic use, and resets at midnight without resetting the default', async () => {
  let now = new Date(2026, 8, 22, 23, 59, 59).getTime();
  const disk = storage({ day: dayKey(now), watchedMs: 180000, limitMinutes: 60 }), s = new Store(disk, () => now);
  const message = { type: 'daily-total', day: dayKey(now), totalSeconds: 10800 };
  await s.request(message); let state = await s.request(message);
  assert.equal(dailyTotal(state), 10800000); assert.equal(state.watchedMs, 180000); assert.equal(state.manualMs, 10620000);
  await assert.rejects(s.request({ ...message, totalSeconds: 2 }), /不能少于/);
  await assert.rejects(s.request({ ...message, totalSeconds: 86401 }));
  now += 2000; state = await new Store(disk, () => now).request({ type: 'status' });
  assert.equal(dailyTotal(state), 0); assert.equal(state.dailyLimitSeconds, 3600); assert.equal(currentUsage(state, now).remainingMs, 3600000);
  await assert.rejects(s.request(message), /日期已变化/);
});
test('redirect addresses require HTTP(S), reject credentials and YouTube loops; corrupt stored data falls back to dialog', () => {
  assert.equal(redirectURL(' https://example.com/breathe?q=calm#start '), 'https://example.com/breathe?q=calm#start');
  assert.equal(redirectURL('http://localhost:8000/'), 'http://localhost:8000/');
  for (const value of ['', 'example.com', 'javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/a', 'https://u:p@example.com', 'https://www.youtube.com/watch?v=x', 'https://YOUTUBE.COM./watch', 'https://youtu.be/id', 'https://music.youtube.com/', 'x'.repeat(2049)]) assert.throws(() => redirectURL(value));
  const state = normalize({ limitAction: 'redirect', redirectUrl: 'javascript:alert(1)' }, Date.now());
  assert.equal(state.limitAction, 'dialog'); assert.equal(state.redirectUrl, '');
});
test('saving end behavior preserves limits and session start, persists across worker restart and midnight', async () => {
  let now = new Date(2026, 8, 22, 12).getTime(); const disk = storage(), s = new Store(disk, () => now);
  let state = await s.request({ type: 'settings', mode: 'session', limitSeconds: 300, restart: true });
  const startedAt = state.session.startedAt;
  state = await s.request({ type: 'behavior', limitAction: 'redirect', redirectUrl: 'https://example.com/calm' });
  assert.equal(state.session.startedAt, startedAt); assert.equal(state.sessionLimitSeconds, 300); assert.equal(state.limitAction, 'redirect');
  await assert.rejects(s.request({ type: 'behavior', limitAction: 'redirect', redirectUrl: 'https://youtube.com/' }));
  await assert.rejects(s.request({ type: 'behavior', limitAction: 'invalid' }));
  now += 86400000; state = await new Store(disk, () => now).request({ type: 'status' });
  assert.equal(state.limitAction, 'redirect'); assert.equal(state.redirectUrl, 'https://example.com/calm');
  state = await s.request({ type: 'behavior', limitAction: 'dialog' });
  assert.equal(state.limitAction, 'dialog'); assert.equal(state.redirectUrl, 'https://example.com/calm');
});
test('video URL aliases resolve to one ID; channels, playlists and lookalike domains are rejected', () => {
  for (const value of ['aaaaaaaaaaa', 'https://www.youtube.com/watch?v=aaaaaaaaaaa&t=30&list=abc', 'https://youtu.be/aaaaaaaaaaa?si=share', 'https://m.youtube.com/watch?v=aaaaaaaaaaa', 'https://www.youtube.com/shorts/aaaaaaaaaaa', 'https://www.youtube.com/live/aaaaaaaaaaa']) assert.equal(videoID(value), 'aaaaaaaaaaa');
  for (const value of ['', 'https://evil.test/watch?v=aaaaaaaaaaa', 'https://youtube.com.evil.test/watch?v=aaaaaaaaaaa', 'https://youtube.com/playlist?list=abc', 'https://youtube.com/@channel', 'javascript:alert(1)', 'https://youtube.com/watch?v=bad']) assert.throws(() => videoID(value));
});
test('exclusion list deduplicates, persists across midnight/worker restart, and drops late reports without clearing totals', async () => {
  let now = Date.now(); const disk = storage(); let s = new Store(disk, () => now);
  await s.request({ type: 'usage', start: now - 1000, end: now, elapsed: 1000, videoId: 'aaaaaaaaaaa' });
  await s.request({ type: 'exclude-add', video: 'https://youtu.be/aaaaaaaaaaa', title: '课程' });
  let state = await s.request({ type: 'exclude-add', video: 'https://www.youtube.com/watch?v=aaaaaaaaaaa&t=20' });
  assert.deepEqual(state.excludedVideos, [{ id: 'aaaaaaaaaaa', title: '课程' }]);
  state = await s.request({ type: 'usage', start: now - 500, end: now, elapsed: 500, videoId: 'aaaaaaaaaaa' });
  assert.equal(state.watchedMs, 1000);
  now += 86400000; s = new Store(disk, () => now); state = await s.request({ type: 'status' });
  assert.equal(isExcluded(state, 'aaaaaaaaaaa'), true); assert.equal(state.watchedMs, 0);
  await s.request({ type: 'exclude-remove', video: 'aaaaaaaaaaa' });
  state = await s.request({ type: 'usage', start: now - 1000, end: now, elapsed: 1000, videoId: 'aaaaaaaaaaa' });
  assert.equal(state.watchedMs, 1000); assert.equal(state.excludedVideos.length, 0);
});
