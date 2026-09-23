/* A single cheap discovery/flush tick replaces retries and per-second logging. */
(() => {
  if (globalThis.__ytLimiter) return;
  const isWatchPage = () => location.pathname === '/watch';
  const getVideoId = () => { try { return isWatchPage() ? YTLCore.videoID(location.href) : null; } catch { return null; } };
  const overlay = new YTLOverlay({ document, getVideoId, toggleExclusion: async () => {
    const id = getVideoId();
    if (!id || !tracker.state) throw new Error('Video not ready');
    const excluded = YTLCore.isExcluded(tracker.state, id);
    const result = await chrome.runtime.sendMessage({ type: excluded ? 'exclude-remove' : 'exclude-add', video: id, title: document.title?.replace(/ - YouTube$/, '') || '' });
    if (result?.error) throw new Error(result.error);
    tracker.updateState(result.state);
  }, navigate: url => location.replace(url), openSettings: async () => {
    const result = await chrome.runtime.sendMessage({ type: 'open-settings' });
    if (result?.error) throw new Error(result.error);
  }});
  const tracker = new YTLTracker({
    getVideoId,
    findVideo: () => isWatchPage() ? document.querySelector('video') : null,
    send: message => chrome.runtime.sendMessage(message),
    onState: state => overlay.update(state),
    onError: () => overlay.showError('观看时间暂时无法保存，请刷新页面重新连接。'),
  });
  const changed = (changes, area) => { if (area === 'local' && changes.usage?.newValue) tracker.updateState(changes.usage.newValue); };
  const start = () => { tracker.navigationStart(); overlay.setVisible(false); };
  const end = () => { tracker.navigationEnd(); if (tracker.state) overlay.update(tracker.state); overlay.setVisible(isWatchPage()); };
  const fullscreen = () => overlay.reparent();
  document.addEventListener('yt-navigate-start', start);
  document.addEventListener('yt-navigate-finish', end);
  document.addEventListener('fullscreenchange', fullscreen);
  chrome.storage.onChanged.addListener(changed);
  const dispose = () => {
    tracker.dispose(); chrome.storage.onChanged.removeListener(changed);
    document.removeEventListener('yt-navigate-start', start); document.removeEventListener('yt-navigate-finish', end);
    document.removeEventListener('fullscreenchange', fullscreen);
    overlay.dispose(); delete globalThis.__ytLimiter;
  };
  window.addEventListener('pagehide', dispose, { once: true });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  globalThis.__ytLimiter = tracker;
  overlay.setVisible(isWatchPage());
  tracker.start();
})();
