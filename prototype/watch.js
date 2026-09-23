(() => {
  const $ = id => document.getElementById(id);
  const runtime = window.YTLPrototype;
  class DemoVideo extends EventTarget {
    paused = true; ended = false; seeking = false; readyState = 4;
    play() { this.paused = false; this.readyState = 4; this.dispatchEvent(new Event('play')); if (!this.paused) this.dispatchEvent(new Event('playing')); showPlayback(); }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); showPlayback(); }
    buffer() { this.readyState = 2; this.dispatchEvent(new Event('waiting')); showPlayback(); }
  }
  let started = false;
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
    onState: state => {
      overlay.update(state);
      if (started) {
        const usage = YTLCore.currentUsage(state, runtime.now());
        $('demo-progress-fill').style.width = `${Math.min(100, usage.watchedMs / usage.limitMs * 100)}%`;
        $('demo-step').textContent = usage.blocked ? 'Complete — playback paused. The reminder is the extension at work.' : 'Watch the floating timer count down. You can also pause or simulate buffering.';
      }
    }, onError: error => { $('demo-log').textContent = error.message; },
  });
  const unsubscribe = runtime.subscribe(changes => tracker.updateState(changes.usage.newValue));
  function showScreen(next) {
    screen = next; $('watch-view').hidden = screen !== 'watch'; $('settings-frame').hidden = screen !== 'settings';
    for (const name of ['watch', 'settings']) { $(`${name}-tab`).classList.toggle('selected', name === screen); if (name === 'settings') $(`${name}-tab`).setAttribute('aria-pressed', String(name === screen)); }
    overlay.setVisible(started && screen === 'watch');
  }
  async function action(message) {
    const result = await runtime.send(message);
    if (result.error) throw new Error(result.error);
    tracker.updateState(result.state); return result.state;
  }
  async function startDemo() {
    video.pause(); overlay.setVisible(false); started = false;
    await runtime.reset();
    await action({ type: 'settings', mode: 'session', limitSeconds: 10, restart: true });
    started = true; showScreen('watch');
    $('watch-tab').textContent = 'Restart demo';
    $('demo-log').textContent = 'Fresh 10-second demo started. Only demo data was reset.';
    video.play();
  }
  function bind(id, fn) { $(id).addEventListener('click', () => Promise.resolve().then(fn).catch(error => { $('demo-log').textContent = error.message; })); }
  bind('watch-tab', startDemo); bind('settings-tab', () => showScreen('settings'));
  bind('play', () => started ? video.play() : startDemo()); bind('pause', () => video.pause()); bind('buffer', () => video.buffer());
  bind('advance', () => { runtime.advance(10); tracker.tick(); });
  bind('switch-video', () => {
    tracker.navigationStart(); id = id === 'aaaaaaaaaaa' ? 'bbbbbbbbbbb' : 'aaaaaaaaaaa';
    $('video-title').textContent = id === 'aaaaaaaaaaa' ? 'Video A · Study session' : 'Video B · Entertainment';
    tracker.navigationEnd(); overlay.update(tracker.state);
  });
  bind('quick-start', startDemo);
  bind('daily-case', async () => {
    started = true; showScreen('watch'); video.pause(); await action({ type: 'settings', mode: 'daily', limitSeconds: 3600 });
    await action({ type: 'daily-total', day: YTLCore.dayKey(runtime.now()), totalSeconds: 10800 });
  });
  bind('next-day', async () => { video.pause(); runtime.advance(86400); tracker.tick(); await action({ type: 'status' }); $('demo-log').textContent = 'Next day: daily allowance restored. Press Play to resume.'; });
  bind('redirect-case', async () => {
    await startDemo(); video.pause(); await action({ type: 'settings', mode: 'session', limitSeconds: 10, restart: true });
    await action({ type: 'behavior', limitAction: 'redirect', redirectUrl: 'https://example.com/calm' }); video.play();
  });
  $('settings-frame').src = '/src/options/index.html';
  overlay.setVisible(false); tracker.start();
  window.addEventListener('pagehide', () => { tracker.dispose(); unsubscribe(); overlay.dispose(); }, { once: true });
})();
