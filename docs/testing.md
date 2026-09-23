# Testing and verification

## Commands

```sh
npm run check
npm test
npm run test:unit
npm run test:integration
TZ=America/New_York npm test
git diff --check
```

No third-party test packages are required. Tests use Node's test runner, injected clocks/storage and browser-like API doubles. The suite currently contains 52 tests.

| Test file | Main coverage |
| --- | --- |
| `tests/unit/core.test.cjs` | Domain rules, storage queue, persistence, validation, dates and exclusions with in-memory storage |
| `tests/unit/tracker.test.cjs` | Receiver-sensitive native timer regression with isolated messaging |
| `tests/unit/overlay.test.cjs` | Floating UI, dialog policy, placement and bilingual text with a fake DOM |
| `tests/unit/i18n.test.cjs` | Translation coverage, placeholders and language persistence |
| `tests/integration/playback.test.cjs` | Real tracker and Store together: elapsed time, buffering, cleanup, limits, exclusions and midnight |
| `tests/integration/content.test.cjs` | Content adapter wiring, SPA navigation, element reuse and lifecycle cleanup |
| `tests/integration/background.test.cjs` | Worker messages, sender checks, storage and settings actions |
| `tests/integration/options.test.cjs` | Settings forms connected to the real Store through a simulated Chrome adapter |
| `tests/integration/project.test.cjs` | Manifest/HTML/import paths, demo separation and allowed prototype routes |

The browser timer regression intentionally models receiver-sensitive native functions. It reproduces the earlier `Illegal invocation` failure that simple arrow-function timer mocks missed.

## Test boundaries

Unit tests focus on one module using injected dependencies. Integration tests connect production modules or validate packaging and development-server routes. Both layers run in Node; neither launches Chrome or streams a real video. Shared fixtures live in `tests/helpers`: in-memory storage, a fake DOM, and a playback harness with controlled clocks and timers. Helpers do not register tests.

The split preserves all 50 existing cases. `npm test` explicitly includes both directories; the layer-specific commands support focused debugging. Add real browser end-to-end tests only when that harness exists, rather than creating an empty coverage category.

## Manual installed-extension checks

1. Reload the unpacked extension and refresh all YouTube and Settings tabs.
2. On a fresh preference store, verify English. Set Chinese and reload: the explicit selection should persist.
3. Play a watch-page video for about 30 seconds. Pause for 10 seconds. Usage should rise only during playback.
4. Test buffering and seeking, then navigate from the homepage to a video and from one video to another.
5. Start a 10-second temporary allowance. Verify pause and dialog at the limit, continued blocking after dismissal, and manual playback after raising the allowance.
6. Configure your own calm URL. Repeat and verify pause before current-tab navigation. Switch back to the dialog action afterward.
7. Exclude video A, play beyond the allowance, then switch to ordinary video B. Only B should consume time and be limited.
8. Use two tabs to verify additive totals and synchronized settings. Reload or restart Chrome to check persistence.
9. Verify local-midnight reset with the actual browser when feasible. Automated clock tests are not a substitute for browser suspension testing.
10. Inspect normal and fullscreen layouts, keyboard navigation, the native dialog and narrow settings windows.

## Prototype checks

Run `npm run prototype` and follow [the demo script](prototype.md). This checks real DOM layout and production logic against simulated inputs. The prototype also demonstrates automatic rollover and intercepts redirects so no external site is opened.

Keep its results separate from installed-extension results. A functioning prototype does not establish actual Chrome API compatibility, video performance or YouTube selector stability.

Verified in the in-app browser on 2026-09-23: English initial UI, production settings embedded with demo data, a 10-second allowance pausing with a reminder, next-day restoration of the daily allowance, intercepted redirect after pausing, and demo reset. The 52 automated tests also passed in the default environment and with `TZ=America/Los_Angeles`.

## Performance evidence

The original playback-stutter report has no completed real-browser A/B measurement. Confirmed accounting and startup defects have regression tests, but their existence does not identify the stutter cause. Follow [the comparison protocol](performance.md) and record dropped-frame deltas, buffering conditions and traces before making performance claims.

## Localization and overlay regression checks

Message coverage checks reject Chinese literals outside the translation resource, verify both dictionaries and matching interpolation placeholders, and resolve the message IDs used by application code. Settings integration tests verify local validation and domain errors in both languages without leaking message IDs into the UI.

In the in-app browser prototype, exclusion toggles were measured with `getBoundingClientRect()` in English and Chinese at narrow and desktop widths. The panel stayed approximately 206 × 251.8 px at the narrow breakpoint and 232 × 251.8 px on desktop; action and exclusion button positions were unchanged before and after toggling. The progress row uses `visibility` with `aria-hidden`, and the detail row reserves space for two lines. This is a real layout check with simulated playback, not an installed-YouTube performance result.
