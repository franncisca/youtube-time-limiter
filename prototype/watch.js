(() => {
  const $ = id => document.getElementById(id);
  const runtime = window.YTLPrototype;
  class DemoVideo extends EventTarget {
    paused = true; ended = false; seeking = false; readyState = 4;
    play() { this.paused = false; this.readyState = 4; this.dispatchEvent(new Event('play')); if (!this.paused) this.dispatchEvent(new Event('playing')); showPlayback(); }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); showPlayback(); }
    buffer() { this.readyState = 2; this.dispatchEvent(new Event('waiting')); showPlayback(); }
  }
  let id = 'aaaaaaaaaaa', screen = 'watch'; const video = new DemoVideo();
  function showPlayback() { $('playback').textContent = video.paused ? 'Paused' : video.readyState < 3 ? 'Buffering…' : 'Playing'; }
  const overlay = new YTLOverlay({ document, now: runtime.now, getVideoId: () => id,
    openSettings: async () => showScreen('settings'),
    navigate: url => { $('demo-log').textContent = `Redirect intercepted: ${url} — playback is paused; no external page was opened.`; },
    toggleExclusion: async () => {
      const excluded = YTLCore.isExcluded(tracker.state, id);
      const result = await runtime.send({ type: excluded ? 'exclude-remove' : 'exclude-add', video: id, title: $('video-title').textContent });
      if (result.error) throw new Error(result.error); tracker.updateState(result.state);
    },
  });
  const tracker = new YTLTracker({ findVideo: () => video, getVideoId: () => id, send: runtime.send, now: runtime.now, monotonic: runtime.monotonic,
    onState: state => overlay.update(state), onError: error => { $('demo-log').textContent = error.message; },
  });
  const unsubscribe = runtime.subscribe(changes => tracker.updateState(changes.usage.newValue));
  function showScreen(next) {
    screen = next; $('watch-view').hidden = screen !== 'watch'; $('settings-frame').hidden = screen !== 'settings';
    for (const name of ['watch', 'settings']) { $(`${name}-tab`).classList.toggle('selected', name === screen); $(`${name}-tab`).setAttribute('aria-pressed', String(name === screen)); }
    overlay.setVisible(screen === 'watch');
  }
  async function action(message) {
    const result = await runtime.send(message);
    if (result.error) throw new Error(result.error);
    tracker.updateState(result.state); return result.state;
  }
  function bind(id, fn) { $(id).addEventListener('click', () => Promise.resolve().then(fn).catch(error => { $('demo-log').textContent = error.message; })); }
  bind('watch-tab', () => showScreen('watch')); bind('settings-tab', () => showScreen('settings'));
  bind('play', () => video.play()); bind('pause', () => video.pause()); bind('buffer', () => video.buffer());
  bind('advance', () => { runtime.advance(10); tracker.tick(); });
  bind('switch-video', () => {
    tracker.navigationStart(); id = id === 'aaaaaaaaaaa' ? 'bbbbbbbbbbb' : 'aaaaaaaaaaa';
    $('video-title').textContent = id === 'aaaaaaaaaaa' ? 'Video A · Study session' : 'Video B · Entertainment';
    tracker.navigationEnd(); overlay.update(tracker.state);
  });
  bind('quick-start', async () => { video.pause(); await action({ type: 'settings', mode: 'session', limitSeconds: 10, restart: true }); video.play(); });
  bind('daily-case', async () => {
    video.pause(); await action({ type: 'settings', mode: 'daily', limitSeconds: 3600 });
    await action({ type: 'daily-total', day: YTLCore.dayKey(runtime.now()), totalSeconds: 10800 });
  });
  bind('next-day', async () => { video.pause(); runtime.advance(86400); tracker.tick(); await action({ type: 'status' }); $('demo-log').textContent = 'Next day: daily allowance restored. Press Play to resume.'; });
  bind('redirect-case', async () => {
    video.pause(); await action({ type: 'settings', mode: 'session', limitSeconds: 10, restart: true });
    await action({ type: 'behavior', limitAction: 'redirect', redirectUrl: 'https://example.com/calm' }); video.play();
  });
  bind('reset', async () => { video.pause(); await runtime.reset(); tracker.tick(); $('demo-log').textContent = 'Demo reset. Default language: English.'; });
  $('settings-frame').src = '/src/options/index.html';
  overlay.setVisible(true); tracker.start();
  window.addEventListener('pagehide', () => { tracker.dispose(); unsubscribe(); overlay.dispose(); }, { once: true });
})();
