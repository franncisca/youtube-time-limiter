const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize } = require('../../src/shared/core.js');
const { t } = require('../../src/shared/i18n.js');
const Overlay = require('../../src/content/overlay.js');
const { createDocument, Element } = require('../helpers/fake-dom.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const now = new Date(2026, 8, 22, 12).getTime(); const document = createDocument(); let opened = 0;
  const overlay = new Overlay({ document, now: () => now, openSettings: async () => opened++ });
  const state = normalize({ language: 'en' }, now); state.watchedMs = 1800000;
  return { overlay, document, state, get opened() { return opened; } };
}
test('floating panel shows selected mode, used and remaining; collapse and side switch do not affect allowance', () => {
  const { overlay, state } = setup(); overlay.setVisible(true); overlay.update(state);
  assert.equal(overlay.remaining.textContent, '00:30:00'); assert.equal(overlay.detail.textContent, 'Watched 00:30:00 / 01:00:00');
  assert.equal(overlay.progress.value, 50); overlay.toggle.click(); assert.equal(overlay.body.hidden, true);
  assert.equal(overlay.compact.textContent, '00:30:00 left'); assert.equal(overlay.toggle.getAttribute('aria-expanded'), 'false');
  overlay.sideButton.click(); assert.equal(overlay.panel.style.left, '16px');
  overlay.toggle.click(); assert.equal(overlay.body.hidden, false); assert.equal(state.watchedMs, 1800000);
  overlay.dispose();
});
test('limit dialog appears once, dismissal does not unlock, and a new limit crossing can notify again', () => {
  const { overlay, state } = setup(); state.watchedMs = 3600000; overlay.setVisible(true); overlay.update(state);
  assert.equal(overlay.dialog.open, true); assert.equal(overlay.dialog.shows, 1);
  overlay.dismiss.click(); overlay.update({ ...state, watchedMs: 3600500 });
  assert.equal(overlay.dialog.open, false); assert.equal(overlay.dialog.shows, 1);
  assert.equal(overlay.panel.getAttribute('data-blocked'), 'true'); assert.equal(state.watchedMs, 3600000);
  overlay.update({ ...state, dailyLimitSeconds: 7200 }); assert.equal(overlay.remaining.textContent, '01:00:00');
  overlay.update({ ...state, watchedMs: 7200000, dailyLimitSeconds: 7200 }); assert.equal(overlay.dialog.shows, 2);
  overlay.update({ ...state, dailyLimitSeconds: 10800 }); assert.equal(overlay.dialog.open, false); overlay.dispose();
});
test('home page stays hidden; entering watch shows a pending alert; leaving closes it and removes UI on dispose', () => {
  const { overlay, state, document } = setup(); state.watchedMs = 3600000; overlay.update(state);
  assert.equal(overlay.panel.hidden, true); assert.equal(overlay.dialog.open, false);
  overlay.setVisible(true); assert.equal(overlay.dialog.open, true);
  overlay.setVisible(false); assert.equal(overlay.dialog.open, false); assert.equal(overlay.panel.hidden, true);
  overlay.setVisible(true); assert.equal(overlay.dialog.shows, 1);
  overlay.dispose(); assert.equal(document.documentElement.children.length, 0);
});
test('full-screen container receives overlay and open dialog; settings action and failures are handled', async () => {
  const f = setup(); f.overlay.setVisible(true); f.overlay.update({ ...f.state, watchedMs: 3600000 });
  const player = new Element('div'); f.document.fullscreenElement = player; f.overlay.reparent();
  assert.equal(f.overlay.host.parentNode, player); assert.equal(f.overlay.dialog.open, true);
  f.overlay.dialogSettings.click(); await flush(); assert.equal(f.opened, 1); assert.equal(f.overlay.dialog.open, false);
  f.document.fullscreenElement = null; f.overlay.reparent(); assert.equal(f.overlay.host.parentNode, f.document.documentElement);
  f.overlay.openSettings = async () => { throw new Error('Disconnected'); }; f.overlay.settingsButton.click(); await flush();
  assert.equal(f.overlay.error.hidden, false); assert.match(f.overlay.error.textContent, /Could not open Settings/); f.overlay.dispose();
});
test('session dialog uses session total instead of daily total', () => {
  const { overlay, state } = setup();
  state.mode = 'session'; state.sessionLimitSeconds = 60; state.session = { startedAt: new Date(2026, 8, 22, 11).getTime(), watchedMs: 60000 };
  overlay.setVisible(true); overlay.update(state);
  assert.equal(overlay.mode.textContent, "Temporary allowance"); assert.match(overlay.message.textContent, /temporary allowance/);
  assert.equal(overlay.summary.textContent, 'Watched 00:01:00 · Limit 00:01:00'); overlay.dispose();
});
test('redirect mode navigates once without a dialog; hidden pages do not navigate and failures fall back to dialog', () => {
  const { overlay, state } = setup(); const destinations = []; overlay.navigate = url => destinations.push(url);
  state.limitAction = 'redirect'; state.redirectUrl = 'https://example.com/calm'; state.watchedMs = 3600000;
  overlay.update(state); assert.equal(destinations.length, 0);
  overlay.setVisible(true); overlay.update(state); overlay.update({ ...state, watchedMs: 3601000 });
  assert.deepEqual(destinations, ['https://example.com/calm']); assert.equal(overlay.dialog.shows, 0);
  overlay.update({ ...state, dailyLimitSeconds: 7200 });
  overlay.navigate = () => { throw new Error('navigation failed'); };
  overlay.update({ ...state, dailyLimitSeconds: 7200, watchedMs: 7200000 });
  assert.equal(overlay.dialog.open, true); assert.equal(overlay.error.hidden, false);
  assert.match(overlay.error.textContent, /Could not redirect/); overlay.dispose();
});
test('switching from popup to redirect at an existing limit closes the dialog and navigates', () => {
  const { overlay, state } = setup(); const destinations = []; overlay.navigate = url => destinations.push(url);
  state.watchedMs = 3600000; overlay.setVisible(true); overlay.update(state); assert.equal(overlay.dialog.open, true);
  overlay.update({ ...state, limitAction: 'redirect', redirectUrl: 'https://example.com/calm' });
  assert.equal(overlay.dialog.open, false); assert.equal(destinations.length, 1); overlay.dispose();
});
test('exempt overlay suppresses both actions, exposes toggle, and refreshes on video identity changes', async () => {
  const { overlay, state } = setup(); let id = 'aaaaaaaaaaa', toggles = 0; const navigations = [];
  overlay.getVideoId = () => id; overlay.toggleExclusion = async () => toggles++; overlay.navigate = url => navigations.push(url);
  state.excludedVideos = [{ id, title: 'Course' }]; state.watchedMs = 3600000;
  overlay.setVisible(true); overlay.update(state);
  assert.equal(overlay.dialog.open, false); assert.equal(overlay.mode.textContent, "Exclude");
  assert.equal(overlay.excludeButton.textContent, "Include");
  state.limitAction = 'redirect'; state.redirectUrl = 'https://example.com/calm'; overlay.update(state);
  assert.equal(navigations.length, 0); overlay.excludeButton.click(); await flush(); assert.equal(toggles, 1);
  id = 'bbbbbbbbbbb'; overlay.update(state); assert.equal(navigations.length, 1);
  assert.equal(overlay.excludeButton.textContent, "Exclude"); overlay.dispose();
});
test('overlay and open dialog switch language live without a new alert or changing collapse state', () => {
  const { overlay, state } = setup(); state.language = 'zh-CN'; overlay.setVisible(true); state.watchedMs = 3600000; overlay.update(state);
  const shows = overlay.dialog.shows; overlay.toggle.click();
  overlay.update({ ...state, language: 'en' });
  assert.equal(overlay.dialog.shows, shows); assert.equal(overlay.dialog.open, true); assert.equal(overlay.body.hidden, true);
  assert.equal(overlay.settingsButton.textContent, 'Settings'); assert.equal(overlay.dismiss.textContent, 'Got it');
  assert.equal(overlay.compact.textContent, '00:00:00 left'); assert.match(overlay.message.textContent, /daily limit/);
  assert.equal(overlay.toggle.getAttribute('aria-label'), 'Expand timer');
  overlay.showError('ui.watchTimeCouldNotBeSavedReloadThis'); assert.match(overlay.error.textContent, /Reload/);
  overlay.update({ ...state, language: 'zh-CN' }); assert.equal(overlay.dismiss.textContent, t('ui.gotIt', 'zh-CN'));
  assert.equal(overlay.error.textContent, t('ui.watchTimeCouldNotBeSavedReloadThis', 'zh-CN')); assert.equal(overlay.dialog.shows, shows); overlay.dispose();
});
