# YouTube Time Limiter

<img src="icons/icon-128.png" alt="YouTube Time Limiter icon" width="80" height="80">

A Chrome extension that helps you manage time on YouTube. Set a viewing allowance, keep track of time in a floating timer, and take a break when the allowance runs out.

Built with **Manifest V3, JavaScript, HTML and CSS**. Data stays on your device. No account, server, build step or runtime dependencies are required. English is the default language; Chinese is also available.

## Features

- **Daily allowance:** set a limit once; it renews automatically at local midnight.
- **Temporary allowance:** start a fresh budget now without changing your daily default.
- **Floating timer:** see time remaining in `HH:MM:SS`, collapse the panel or move it to either side.
- **Limit actions:** pause with a reminder, or pause and redirect to your chosen calm page.
- **Excluded videos:** choose individual videos that do not count toward your allowance or trigger limits.
- **Local persistence:** keep settings and recorded usage across page reloads and browser restarts.
- **Manual correction:** add missing viewing time to today's total when needed.

## Install and use

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select the repository root containing `manifest.json`.
4. Refresh any open YouTube tabs.
5. Click the extension icon, set your allowance and save. Play a video to see the floating timer.

The default daily allowance is **1 hour**. You can choose a limit from **1 second to 24 hours**. After changing source files, reload the extension and refresh YouTube and Settings. No `npm install` or compilation is needed.

## How timing works

| Mode | What counts | Example: already watched 3 hours, then set a 1-hour limit |
| --- | --- | --- |
| Daily | Today's recorded total, including manual corrections | No time remains |
| Temporary | Viewing since you last pressed Start | A fresh hour remains |

Temporary allowances expire at local midnight, when the daily allowance returns.

Only active playback counts. Pauses, buffering and seeking do not count. Playback speed does not change the rate: one minute watching at 2× speed still uses one minute. Background playback and player ads count; simultaneous videos count separately.

Viewing before installation or while the extension was disabled cannot be recovered automatically. Use **Correct today's total** to enter the missing total. This sets today's total rather than adding that amount again.

At the limit, playback pauses. Closing the reminder does not remove the limit. After increasing the allowance, resume playback manually. Redirects use a valid HTTP(S) address and replace the current tab. Excluding a video does not erase time already recorded.

See [Usage and limitations](docs/usage.md) for details.

## Interactive demo

Requires **Node.js 18+**:

```sh
npm run prototype
```

Open [localhost:8765](http://127.0.0.1:8765):

1. Click **Start demo** to begin a simulated 10-second viewing session.
2. Watch the timer count down. Playback pauses and a reminder appears at the limit.
3. Use **Restart demo** to reset demo data and repeat, or **Preview settings** to explore settings.
4. Expand **Explore more scenarios** to try daily limits, midnight reset and redirects.

The playback and scenario buttons are demo controls. The floating timer, reminder and settings are the actual extension UI, running with simulated data. No real YouTube video plays, redirects are intercepted, and your installed extension's data is untouched.

Stop the server with `Ctrl+C`. If port 8765 is busy, use `PORT=8766 npm run prototype`. See the [Demo guide](docs/prototype.md).

## Architecture

The extension runs entirely in the browser:

- **Content scripts** observe playback, measure elapsed time and display the timer.
- **The service worker** handles messages and serializes writes to `chrome.storage.local` so tabs do not overwrite each other's totals.
- **The settings page** manages allowances, languages, exclusions and limit actions.
- **Shared modules** define timing rules, validation and translations.

A remote backend would add complexity without helping this single-device version. Cross-device synchronization would be a reason to revisit that choice. Plain JavaScript and injected clocks/storage keep the project easy to inspect and test.

See [Technical architecture](docs/architecture.md) for diagrams, data flow and tradeoffs.

## Project structure

```text
manifest.json          Chrome entry points and permissions
src/
  background/          Service worker and messaging
  content/             Playback tracking, page lifecycle and floating UI
  options/             Settings page
  shared/              Domain rules and translations
tests/
  unit/                Individual module behavior
  integration/         Modules, adapters and packaging working together
  helpers/             Shared test fixtures
prototype/             Isolated interactive demo
scripts/               Validation and demo server
docs/                  Usage, architecture and verification
```

See [Project structure](docs/project-structure.md) for module responsibilities and contribution guidance.

## Tests

Use Node.js 18+; no test dependencies need installing.

```sh
npm run check                     # Validate entry points and run all tests
npm test                          # Run all automated tests
npm run test:unit                  # Run unit tests
npm run test:integration           # Run integration tests
TZ=America/Los_Angeles npm test    # Check behavior in another time zone
```

Tests cover playback states, timer cleanup, page navigation, storage, limits, midnight resets, exclusions, translations and settings. Browser prototype checks cover the demo flow and layout. See [Testing](docs/testing.md) for coverage and installed-extension checks.

## Known limitations

- Tracking supports desktop `www.youtube.com/watch` pages. Shorts, embedded players and mobile pages are outside the current scope.
- Timer ticks, browser throttling and messaging can delay enforcement. Abrupt shutdowns can lose unsaved time; sleep and clock changes can affect accounting.
- The floating timer may not appear in native video fullscreen or picture-in-picture.
- This is a voluntary personal tool. Users can change limits, clear data or disable the extension.
- **The reported playback-stutter cause remains unverified.** Automated tests and the demo do not establish real YouTube playback performance. See the [Performance investigation](docs/performance.md).
