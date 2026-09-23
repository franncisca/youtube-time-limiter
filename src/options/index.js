const $ = selector => document.querySelector(selector);
let state = null, busy = false, initialized = false, correctionDay = null, exclusionsKey = null;
const t = (key, values) => YTLI18n.t(key, state?.language || 'en', values);
function translatePage() {
  document.documentElement.lang = state?.language || 'en';
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.getAttribute('data-i18n'));
  for (const node of document.querySelectorAll('[data-i18n-aria]')) node.setAttribute('aria-label', t(node.getAttribute('data-i18n-aria')));
  for (const node of document.querySelectorAll('[data-i18n-placeholder]')) node.setAttribute('placeholder', t(node.getAttribute('data-i18n-placeholder')));
  $('#language').value = state?.language || 'en';
}
const selectedMode = () => $('#mode-session').checked ? 'session' : 'daily';
function setDuration(total) {
  $('#hours').value = Math.floor(total / 3600);
  $('#minutes').value = Math.floor(total / 60) % 60;
  $('#seconds').value = total % 60;
}
function draftChanged() {
  const session = selectedMode() === 'session';
  $('#mode-help').textContent = session
    ? t('ui.sessionModeHelp')
    : t('ui.dailyModeHelp');
  $('#limit-label').textContent = session ? t('ui.allowanceFromNow') : t('ui.dailyAllowance');
  $('#save').textContent = session ? t('ui.start') : t('ui.save');
}
function render(value, settings = false, behavior = false) {
  const oldLanguage = state?.language;
  state = YTLCore.normalize(value, Date.now());
  if (oldLanguage !== state.language) {
    translatePage();
    for (const id of ['status', 'behavior-status', 'exclusion-status', 'correction-status', 'language-status']) $(`#${id}`).textContent = '';
  }
  if (correctionDay) $('#correction-date').textContent = t('ui.correctionDateDayReloadAfterMidnight', { day: correctionDay });
  const usage = YTLCore.currentUsage(state);
  $('#current-mode').textContent = state.mode === 'session' ? t('ui.temporaryFromYourStartTime') : t('ui.dailyTotalWatchedToday');
  $('#usage').textContent = YTLCore.formatTime(usage.watchedMs);
  $('#remaining').textContent = YTLCore.formatTime(usage.remainingMs);
  $('#active-limit').textContent = YTLCore.formatTime(usage.limitMs);
  $('#daily-total').textContent = YTLCore.formatTime(YTLCore.dailyTotal(state));
  $('#time-source').textContent = t('ui.recordedAutoManualManual', { auto: YTLCore.formatTime(state.watchedMs), manual: YTLCore.formatTime(state.manualMs) });
  $('#default-summary').textContent = t('ui.dailyLimitLimitSavedRenewsAutomaticallyEveryDay', { limit: YTLCore.formatTime(state.dailyLimitSeconds * 1000) });
  $('#progress').value = Math.min(100, usage.watchedMs / usage.limitMs * 100);
  $('#limit-state').textContent = usage.blocked ? t('ui.limitReached') : t('ui.timeAvailable');
  $('#limit-state').classList.toggle('exhausted', usage.blocked);
  $('#range').textContent = state.mode === 'session'
    ? t('ui.startedDateDailyLimitReturnsAtMidnight', { date: new Date(state.session.startedAt).toLocaleString(state.language, { hour12: false }) })
    : t('ui.day0000ToNowAllowanceRenewsAt', { day: state.day });
  if (settings) { $(`#mode-${state.mode}`).checked = true; setDuration(state.limitSeconds); }
  if (behavior || !initialized) {
    $('#action-dialog').checked = state.limitAction === 'dialog';
    $('#action-redirect').checked = state.limitAction === 'redirect';
    $('#redirect-url').value = state.redirectUrl;
    behaviorChanged();
  }
  renderExclusions();
  draftChanged();
}
function renderExclusions() {
  const key = state.language + JSON.stringify(state.excludedVideos);
  if (key === exclusionsKey) return;
  exclusionsKey = key;
  const list = $('#exclusion-list'); list.replaceChildren();
  $('#exclusion-empty').hidden = state.excludedVideos.length > 0;
  for (const entry of state.excludedVideos) {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.href = `https://www.youtube.com/watch?v=${entry.id}`; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = entry.title ? `${entry.title} · ${entry.id}` : entry.id;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = t('ui.remove');
    remove.setAttribute('aria-label', t('ui.removeTitle', { title: entry.title || entry.id }));
    remove.addEventListener('click', async () => {
      if (busy) return;
      busy = true; disableControls(true);
      if (await request({ type: 'exclude-remove', video: entry.id }, false, '#exclusion-status')) $('#exclusion-status').textContent = t('ui.removedTimingAndLimitsApplyToThisVideo');
      busy = false; disableControls(false);
    });
    row.append(link, remove); list.append(row);
  }
}
function behaviorChanged() {
  const redirect = $('#action-redirect').checked;
  $('#redirect-fields').hidden = !redirect;
  $('#redirect-url').disabled = !redirect;
  $('#redirect-url').required = redirect;
}
function disableControls(disabled) {
  $('#language').disabled = disabled;
  $('#controls').disabled = disabled;
  $('#correction-controls').disabled = disabled;
  $('#behavior-controls').disabled = disabled;
  $('#exclusion-controls').disabled = disabled;
}
async function request(message, settings = false, statusId = '#status') {
  try {
    const result = await chrome.runtime.sendMessage(message);
    if (result.error) throw new Error(result.error);
    render(result.state, settings || !initialized, message.type === 'behavior');
    if (!initialized) { correctionDay = state.day; $('#correction-date').textContent = t('ui.correctionDateDayReloadAfterMidnight', { day: correctionDay }); }
    initialized = true;
    if (!busy) disableControls(false);
    return true;
  } catch (error) { $(statusId).textContent = t('ui.requestFailed', { error: t(error.message) }); return false; }
}
function readDuration(prefix = '') {
  const parts = ['hours', 'minutes', 'seconds'].map(id => Number($(`#${prefix}${id}`).value));
  if (!parts.every(Number.isInteger) || parts[0] < 0 || parts[1] < 0 || parts[1] > 59 || parts[2] < 0 || parts[2] > 59) return NaN;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
async function save() {
  if (busy || !$('#settings').reportValidity()) return;
  const total = readDuration();
  if (!Number.isFinite(total) || total < 1 || total > 86400) { $('#status').textContent = t('ui.chooseALimitBetween1SecondAnd24'); return; }
  const message = { type: 'settings', mode: selectedMode(), limitSeconds: total, restart: selectedMode() === 'session' };
  busy = true; disableControls(true);
  if (await request(message, true)) $('#status').textContent = message.mode === 'session'
    ? t('ui.startedWithAFullTemporaryAllowanceYourDaily')
    : t('ui.dailyLimitSavedItRenewsAutomaticallyTodayS');
  busy = false; disableControls(false);
}
$('#settings').addEventListener('submit', event => { event.preventDefault(); save(); });
$('#correction-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !state || !$('#correction-form').reportValidity()) return;
  const total = readDuration('total-');
  if (!Number.isFinite(total) || total < 0 || total > 86400) { $('#correction-status').textContent = t('ui.enterADailyTotalBetween0And24'); return; }
  const day = correctionDay;
  busy = true; disableControls(true);
  if (await request({ type: 'daily-total', day, totalSeconds: total }, false, '#correction-status')) $('#correction-status').textContent = t('ui.todaySTotalUpdatedSavingTheSameTotal');
  busy = false; disableControls(false);
});
$('#behavior-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !state || !$('#behavior-form').reportValidity()) return;
  const limitAction = $('#action-redirect').checked ? 'redirect' : 'dialog';
  let redirectUrl = $('#redirect-url').value;
  try { if (limitAction === 'redirect') redirectUrl = YTLCore.redirectURL(redirectUrl); }
  catch (error) { $('#behavior-status').textContent = t(error.message); return; }
  busy = true; disableControls(true);
  if (await request({ type: 'behavior', limitAction, redirectUrl }, false, '#behavior-status')) $('#behavior-status').textContent = limitAction === 'redirect'
    ? t('ui.savedPauseThenOpenYourCalmPageTimer')
    : t('ui.savedPauseAndShowAReminderOnThis');
  busy = false; disableControls(false);
});
$('#exclusion-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !state || !$('#exclusion-form').reportValidity()) return;
  let video;
  try { video = YTLCore.videoID($('#exclusion-video').value); }
  catch (error) { $('#exclusion-status').textContent = t(error.message); return; }
  busy = true; disableControls(true);
  if (await request({ type: 'exclude-add', video, title: $('#exclusion-title').value }, false, '#exclusion-status')) {
    $('#exclusion-status').textContent = t('ui.excludedOpenWatchPagesUpdateAutomatically');
    $('#exclusion-video').value = ''; $('#exclusion-title').value = '';
  }
  busy = false; disableControls(false);
});
$('#language').addEventListener('change', async () => {
  if (busy) return;
  const language = $('#language').value;
  busy = true; disableControls(true);
  if (await request({ type: 'language', language }, false, '#language-status')) $('#language-status').textContent = t('ui.languageSaved');
  else $('#language').value = state?.language || 'en';
  busy = false; disableControls(false);
});
for (const input of document.querySelectorAll('input[name="limit-action"]')) input.addEventListener('change', behaviorChanged);
for (const input of document.querySelectorAll('input[name="mode"]')) input.addEventListener('change', () => {
  if (state) setDuration(selectedMode() === 'session' ? state.sessionLimitSeconds : state.dailyLimitSeconds);
  draftChanged();
});
for (const button of document.querySelectorAll('[data-minutes]')) button.addEventListener('click', () => setDuration(Number(button.dataset.minutes) * 60));
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.usage?.newValue) render(changes.usage.newValue); });
request({ type: 'status' }, true);
// Storage broadcasts provide second-level updates; polling covers midnight while idle.
setInterval(() => request({ type: 'status' }), 1000);
