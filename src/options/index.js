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
    ? t('每次点击下方按钮，都会从此刻重新给予完整额度。之前已看的时间不扣减这次额度；午夜自动恢复每日默认额度。')
    : t('剩余 = 每日默认额度 − 当天已观看总时间。已看 3 小时、每日额度 1 小时，剩余就是 0；次日自动获得新的每日额度。');
  $('#limit-label').textContent = session ? t('从现在起，还可以观看') : t('每天最多观看');
  $('#save').textContent = session ? t('开始计时') : t('保存');
}
function render(value, settings = false, behavior = false) {
  const oldLanguage = state?.language;
  state = YTLCore.normalize(value, Date.now());
  if (oldLanguage !== state.language) {
    translatePage();
    for (const id of ['status', 'behavior-status', 'exclusion-status', 'correction-status', 'language-status']) $(`#${id}`).textContent = '';
  }
  if (correctionDay) $('#correction-date').textContent = t('补齐日期：{day}（跨天后请刷新页面）', { day: correctionDay });
  const usage = YTLCore.currentUsage(state);
  $('#current-mode').textContent = state.mode === 'session' ? t('临时额度 · 从设置时刻起') : t('每日额度 · 当天总时间');
  $('#usage').textContent = YTLCore.formatTime(usage.watchedMs);
  $('#remaining').textContent = YTLCore.formatTime(usage.remainingMs);
  $('#active-limit').textContent = YTLCore.formatTime(usage.limitMs);
  $('#daily-total').textContent = YTLCore.formatTime(YTLCore.dailyTotal(state));
  $('#time-source').textContent = t('自动记录 {auto} + 手动补齐 {manual}', { auto: YTLCore.formatTime(state.watchedMs), manual: YTLCore.formatTime(state.manualMs) });
  $('#default-summary').textContent = t('每日默认额度：{limit} · 已保存，每天自动生效，无需每天设置。', { limit: YTLCore.formatTime(state.dailyLimitSeconds * 1000) });
  $('#progress').value = Math.min(100, usage.watchedMs / usage.limitMs * 100);
  $('#limit-state').textContent = usage.blocked ? t('已达上限') : t('尚有额度');
  $('#limit-state').classList.toggle('exhausted', usage.blocked);
  $('#range').textContent = state.mode === 'session'
    ? t('开始于 {date} · 午夜恢复每日默认额度', { date: new Date(state.session.startedAt).toLocaleString(state.language, { hour12: false }) })
    : t('{day} 00:00 至现在 · 每天午夜自动恢复额度', { day: state.day });
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
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = t('移除');
    remove.setAttribute('aria-label', t('移除 {title}', { title: entry.title || entry.id }));
    remove.addEventListener('click', async () => {
      if (busy) return;
      busy = true; disableControls(true);
      if (await request({ type: 'exclude-remove', video: entry.id }, false, '#exclusion-status')) $('#exclusion-status').textContent = t('已移除。该视频将恢复计时与到限限制。');
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
    if (!initialized) { correctionDay = state.day; $('#correction-date').textContent = t('补齐日期：{day}（跨天后请刷新页面）', { day: correctionDay }); }
    initialized = true;
    if (!busy) disableControls(false);
    return true;
  } catch (error) { $(statusId).textContent = t('暂时无法保存或读取：{error}', { error: t(error.message) }); return false; }
}
function readDuration(prefix = '') {
  const parts = ['hours', 'minutes', 'seconds'].map(id => Number($(`#${prefix}${id}`).value));
  if (!parts.every(Number.isInteger) || parts[0] < 0 || parts[1] < 0 || parts[1] > 59 || parts[2] < 0 || parts[2] > 59) return NaN;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}
async function save() {
  if (busy || !$('#settings').reportValidity()) return;
  const total = readDuration();
  if (!Number.isFinite(total) || total < 1 || total > 86400) { $('#status').textContent = t('请设置 1 秒至 24 小时的观看上限。'); return; }
  const message = { type: 'settings', mode: selectedMode(), limitSeconds: total, restart: selectedMode() === 'session' };
  busy = true; disableControls(true);
  if (await request(message, true)) $('#status').textContent = message.mode === 'session'
    ? t('已从此刻开始，剩余完整临时额度。每日默认额度未改变；请手动播放视频。')
    : t('每日默认额度已保存，之后每天自动生效。当天已观看时间不会清零。');
  busy = false; disableControls(false);
}
$('#settings').addEventListener('submit', event => { event.preventDefault(); save(); });
$('#correction-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !state || !$('#correction-form').reportValidity()) return;
  const total = readDuration('total-');
  if (!Number.isFinite(total) || total < 0 || total > 86400) { $('#correction-status').textContent = t('请填写 0 至 24 小时的今日总时间。'); return; }
  const day = correctionDay;
  busy = true; disableControls(true);
  if (await request({ type: 'daily-total', day, totalSeconds: total }, false, '#correction-status')) $('#correction-status').textContent = t('今日总时间已补齐。重复保存相同时间不会重复增加；后续播放将继续累计。');
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
    ? t('已保存：到限先暂停，再自动前往你的静心页面。计时起点和每日额度未改变。')
    : t('已保存：到限暂停并弹窗，留在当前页面。');
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
    $('#exclusion-status').textContent = t('已加入不计时清单，打开的观看页会自动生效。');
    $('#exclusion-video').value = ''; $('#exclusion-title').value = '';
  }
  busy = false; disableControls(false);
});
$('#language').addEventListener('change', async () => {
  if (busy) return;
  const language = $('#language').value;
  busy = true; disableControls(true);
  if (await request({ type: 'language', language }, false, '#language-status')) $('#language-status').textContent = t('语言已保存');
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
