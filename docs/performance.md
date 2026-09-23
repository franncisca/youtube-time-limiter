# Playback performance investigation — 2026-09-22

## Findings and evidence

Historical note: source paths in the original observations below refer to the former flat layout. Current code lives under `src/`; see [the migration table](project-structure.md).

The initial `git diff` was inspected before editing. It contained uncommitted watch-time/timer work in `content.js`; that intent is retained in the new controller. An exact pre-edit patch was also saved at `/tmp/youtube-time-limiter-initial.patch` for this session. No reset, checkout, or commit was performed.

Confirmed by code inspection:

- `video.pause` is a method, so the initial-state branch always selected paused. Use `video.paused`.
- `listenerAttached` was never set. However, the original discovery interval stops after its first successful attachment; this alone does **not** establish repeated listeners during ordinary execution.
- `play` was treated as active playback, including times before buffering finished; `waiting`, seeking and video replacement were not handled.
- Discovery stopped after 15 attempts and the manifest only injected on direct watch URLs. Navigating from the YouTube homepage could miss initialization.
- The original implementation logged each second. Logging has been removed, but there is no measurement showing it caused stutter.

The original timer does not itself call `pause()`. The code defects above establish incorrect accounting/lifecycle behavior, **not the cause of playback stutter**. The updated controller only pauses when the stored daily allowance is exhausted; it does not manipulate playback rate, seek position, sources or the player DOM.

## Browser comparison status

**Not completed. No FPS, dropped-frame or long-task results are claimed.** Computer Use returned `Computer Use was not approved to use Google Chrome`. Automated tests use fake video events/clocks and Chrome API adapters; they cannot validate real decoding, rendering, YouTube events, MV3 worker scheduling, or Chrome storage latency. The performance root cause remains unverified.

## Reproducible comparison procedure

1. Use the same Chrome version/profile, machine, power mode, network, video segment, fixed resolution and playback speed. Close unrelated playing tabs. Record Chrome version, OS, video URL, resolution, codec and date.
2. Test A: disable this extension and reload the watch page. Test B: enable this version, reload, and set the limit above current usage so intentional limit pauses do not contaminate results. If available, also test the pre-change version in a separate checkout/profile without altering the working tree.
3. Warm up playback for 30 seconds. Run each condition for 60 seconds at least three times, alternating A/B order. Keep DevTools state identical; do not compare cold-buffer runs to warm ones.
4. Right-click the player → Stats for nerds. Record beginning/end total and dropped frames, buffer health and connection speed. Compare **deltas**, not cumulative dropped frames. Separate buffering/network stalls from rendering drops.
5. Optionally paste the measurement snippet below in DevTools for each run. Export its single final result and a Performance trace. Reject runs that include ads, video replacement, manual pause/seek, limit enforcement or quality changes.
6. Compare dropped-frame fraction and long-task duration across repeats. Inspect a trace for extension-attributed work before claiming causation. Also test normal → paused → buffering → resumed, homepage → watch → next video, reload, two tabs, and one-minute enforcement.

```js
(async () => {
  const video = document.querySelector('video');
  if (!video) throw new Error('No video');
  const baseline = video.getVideoPlaybackQuality();
  const begin = performance.now();
  let longTasks = 0, longTaskMs = 0, waits = 0, pauses = 0;
  const waiting = () => waits++, paused = () => pauses++;
  video.addEventListener('waiting', waiting);
  video.addEventListener('pause', paused);
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) { longTasks++; longTaskMs += entry.duration; }
  });
  observer.observe({ type: 'longtask' });
  await new Promise(resolve => setTimeout(resolve, 60000));
  const final = video.getVideoPlaybackQuality();
  observer.disconnect();
  video.removeEventListener('waiting', waiting);
  video.removeEventListener('pause', paused);
  const frames = final.totalVideoFrames - baseline.totalVideoFrames;
  const dropped = final.droppedVideoFrames - baseline.droppedVideoFrames;
  console.table({ durationMs: performance.now() - begin, frames, dropped,
    droppedFraction: frames ? dropped / frames : null, longTasks, longTaskMs,
    waits, pauses, sameVideo: video === document.querySelector('video') });
})();
```

Long tasks measured here concern the page main thread; this is not a complete measurement of service-worker/storage overhead. Use Chrome traces for attribution. Never infer improvement merely from removing logs or passing unit tests.

## Manual-test follow-up: startup failure

A user-supplied Chrome error screenshot showed `Uncaught TypeError: Illegal invocation` at `tracker.js:12`, the `this.schedule(...)` call. The default scheduler stored the native `setInterval` function as an instance property, so calling it supplied the Tracker as its receiver. This prevented the discovery/settlement timer from starting. The same issue affected the default cancellation function.

Both defaults now wrap calls through the global object (`root.setInterval` / `root.clearInterval`). A regression test uses receiver-checking browser-like timer functions: it reproduced the exact exception before the fix and passes afterward, checking both startup and disposal. Earlier arrow-function timer mocks did not enforce this browser constraint. At the time of that fix, all 14 tests passed in the default and New York time zones. This establishes a startup defect and regression fix; actual Chrome retesting and the playback-stutter A/B comparison are still pending.
