/* Shared, dependency-free domain logic; also loaded directly by Node tests. */
(function (root) {
  const dayKey = (time) => {
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const validSeconds = value => Number.isInteger(value) && value >= 1 && value <= 86400;
  function redirectURL(value) {
    if (typeof value !== 'string' || value.trim().length > 2048) throw new Error('error.invalidCalmUrl');
    let url;
    try { url = new URL(value.trim()); } catch { throw new Error('error.incompleteCalmUrl'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('error.unsafeCalmUrl');
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be')) throw new Error('error.redirectLoop');
    return url.href;
  }
  function videoID(value) {
    if (typeof value !== 'string') throw new Error('error.missingVideo');
    const input = value.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
    let url;
    try { url = new URL(input); } catch { throw new Error('error.incompleteVideoUrl'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('error.invalidVideoUrl');
    const host = url.hostname.toLowerCase();
    let id;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = url.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(id || '')) throw new Error('error.singleVideoRequired');
    return id;
  }
  const isExcluded = (state, id) => Boolean(id && state?.excludedVideos?.some(entry => entry.id === id));
  function normalize(value, now) {
    const legacyLimit = Number.isInteger(value?.limitMinutes) && value.limitMinutes >= 1 && value.limitMinutes <= 1440 ? value.limitMinutes * 60 : 3600;
    const oldLimit = validSeconds(value?.limitSeconds) ? value.limitSeconds : legacyLimit;
    const dailyLimitSeconds = validSeconds(value?.dailyLimitSeconds) ? value.dailyLimitSeconds : value?.mode === 'session' ? 3600 : oldLimit;
    const sessionLimitSeconds = validSeconds(value?.sessionLimitSeconds) ? value.sessionLimitSeconds : value?.mode === 'session' ? oldLimit : 3600;
    const session = Number.isFinite(value?.session?.startedAt) && Number.isFinite(value?.session?.watchedMs) && dayKey(value.session.startedAt) === dayKey(now)
      ? { startedAt: value.session.startedAt, watchedMs: Math.max(0, value.session.watchedMs) } : null;
    const mode = value?.mode === 'session' && session ? 'session' : 'daily';
    const limitSeconds = mode === 'session' ? sessionLimitSeconds : dailyLimitSeconds;
    const excludedVideos = [];
    if (Array.isArray(value?.excludedVideos)) for (const entry of value.excludedVideos) {
      if (/^[A-Za-z0-9_-]{11}$/.test(entry?.id || '') && !excludedVideos.some(item => item.id === entry.id)) excludedVideos.push({ id: entry.id, title: typeof entry.title === 'string' ? entry.title.slice(0, 160) : '' });
    }
    let redirectUrl = '';
    try { if (value?.redirectUrl) redirectUrl = redirectURL(value.redirectUrl); } catch { /* Invalid stored destinations fall back to a dialog. */ }
    return {
      language: value?.language === 'zh-CN' ? 'zh-CN' : 'en',
      excludedVideos,
      limitAction: value?.limitAction === 'redirect' && redirectUrl ? 'redirect' : 'dialog', redirectUrl,
      day: dayKey(now),
      watchedMs: value?.day === dayKey(now) && Number.isFinite(value.watchedMs) ? Math.max(0, value.watchedMs) : 0,
      manualMs: value?.day === dayKey(now) && Number.isFinite(value.manualMs) ? Math.max(0, value.manualMs) : 0,
      limitMinutes: limitSeconds / 60, limitSeconds,
      dailyLimitSeconds, sessionLimitSeconds, mode, session,
    };
  }
  const dailyTotal = state => state.watchedMs + (state.manualMs || 0);
  function currentUsage(value, now = Date.now()) {
    const state = normalize(value, now);
    const watchedMs = state.mode === 'session' ? state.session.watchedMs : dailyTotal(state);
    const limitMs = state.limitSeconds * 1000;
    return { watchedMs, limitMs, remainingMs: Math.max(0, limitMs - watchedMs), blocked: watchedMs >= limitMs };
  }
  function formatTime(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  }
  function addUsage(value, message, now) {
    const state = normalize(value, now);
    const { start, end, elapsed } = message;
    if (![start, end, elapsed].every(Number.isFinite) || end < start || elapsed < 0 || end > now + 5000) throw new Error('error.invalidUsageInterval');
    if (message.videoId !== undefined && message.videoId !== null && !/^[A-Za-z0-9_-]{11}$/.test(message.videoId)) throw new Error('error.invalidVideoId');
    if (isExcluded(state, message.videoId)) return state;
    const portionSince = boundary => {
      if (end === start) return end >= boundary && end <= now ? elapsed : 0;
      const overlap = Math.max(0, Math.min(end, now) - Math.max(start, boundary));
      return elapsed * overlap / (end - start);
    };
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    state.watchedMs += portionSince(midnight.getTime());
    // Delayed reports straddling a session restart contribute only their new portion.
    if (state.session) state.session.watchedMs += portionSince(state.session.startedAt);
    return state;
  }
  class Store {
    constructor(storage, now = Date.now) { this.storage = storage; this.now = now; this.queue = Promise.resolve(); }
    request(message) {
      const operation = this.queue.then(async () => {
        const saved = (await this.storage.get('usage')).usage;
        let state = normalize(saved, this.now());
        if (message.type === 'usage') state = addUsage(state, message, this.now());
        else if (message.type === 'limit') {
          if (!Number.isInteger(message.minutes) || message.minutes < 1 || message.minutes > 1440) throw new Error('error.invalidLimitMinutes');
          state.dailyLimitSeconds = message.minutes * 60;
        } else if (message.type === 'settings') {
          if (!['daily', 'session'].includes(message.mode) || !validSeconds(message.limitSeconds)) throw new Error('error.invalidSettings');
          if (message.restart !== undefined && typeof message.restart !== 'boolean') throw new Error('error.invalidRestart');
          state.mode = message.mode;
          state[message.mode === 'session' ? 'sessionLimitSeconds' : 'dailyLimitSeconds'] = message.limitSeconds;
          if (message.mode === 'session' && (message.restart || !state.session)) state.session = { startedAt: this.now(), watchedMs: 0 };
        } else if (message.type === 'language') {
          if (!['zh-CN', 'en'].includes(message.language)) throw new Error('error.unsupportedLanguage');
          state.language = message.language;
        } else if (message.type === 'exclude-add') {
          const id = videoID(message.video);
          const title = typeof message.title === 'string' ? message.title.trim().slice(0, 160) : '';
          const existing = state.excludedVideos.find(entry => entry.id === id);
          if (!existing) state.excludedVideos.push({ id, title });
          else if (title) existing.title = title;
        } else if (message.type === 'exclude-remove') {
          const id = videoID(message.video);
          state.excludedVideos = state.excludedVideos.filter(entry => entry.id !== id);
        } else if (message.type === 'behavior') {
          if (!['dialog', 'redirect'].includes(message.limitAction)) throw new Error('error.invalidLimitAction');
          state.limitAction = message.limitAction;
          if (message.limitAction === 'redirect') state.redirectUrl = redirectURL(message.redirectUrl);
        } else if (message.type === 'daily-total') {
          if (message.day !== state.day) throw new Error('error.correctionDateChanged');
          if (!Number.isInteger(message.totalSeconds) || message.totalSeconds < 0 || message.totalSeconds > 86400) throw new Error('error.invalidDailyTotal');
          if (message.totalSeconds * 1000 < dailyTotal(state)) throw new Error('error.correctionBelowTotal');
          // Replace only the manual contribution; repeated submissions are not additive.
          state.manualMs = message.totalSeconds * 1000 - state.watchedMs;
        } else if (message.type !== 'status') throw new Error('error.unknownRequest');
        state = normalize(state, this.now());
        if (JSON.stringify(saved) !== JSON.stringify(state)) await this.storage.set({ usage: state });
        return state;
      });
      this.queue = operation.catch(() => {});
      return operation;
    }
  }
  root.YTLCore = { dayKey, redirectURL, videoID, isExcluded, normalize, dailyTotal, currentUsage, formatTime, addUsage, Store };
  if (typeof module !== 'undefined') module.exports = root.YTLCore;
})(globalThis);
