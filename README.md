# YouTube Time Limiter

A local-first Chrome extension that turns a viewing budget into a visible timer, a pause, and a deliberate next step.

Built with **Manifest V3, plain JavaScript, HTML and CSS**. No account, cloud service, build step, runtime dependencies, or telemetry. English is the default; Chinese is available in Settings.

## What it does

- **Daily allowance:** set it once; it renews automatically at local midnight. Previously watched time is deducted from today's allowance.
- **Temporary allowance:** start a fresh budget now without changing the daily default. The temporary override expires at midnight.
- **Live floating timer:** hours, minutes, seconds, remaining time and progress; collapse it or move it to either side.
- **Two limit actions:** pause and show a reminder, or pause and redirect the current tab to your chosen calm page.
- **Excluded videos:** save individual videos that should use no allowance and trigger no limit action.
- **Local persistence:** settings and usage survive reloads and browser restarts. Multiple playing tabs contribute additive time.
- **Bilingual interface:** settings, reminders, accessibility labels and validation messages follow the saved language.

Tracking covers desktop `https://www.youtube.com/watch?...` pages, including navigation into them from the homepage. Shorts, embedded players and mobile pages are outside the tracking scope.

## Run the extension

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the repository root, where `manifest.json` lives.
4. Reload existing YouTube tabs.
5. Click the extension icon to open Settings, choose an allowance and save.

After editing source files, reload the extension and refresh YouTube and Settings. No `npm install` or compilation is needed.

New installations and profiles without a saved language use English. An existing explicit Chinese preference is preserved; choose **English** in Settings to change it. The directory refactor preserves the storage key and does not intentionally reset existing data.

## Try the interactive prototype

Requires Node.js 18 or newer. Verified with Node 22.11.0.

```sh
npm run prototype
```

Open [the local prototype](http://127.0.0.1:8765). Use **Watch demo** for playback scenarios and **Settings** for the actual extension settings interface with a mock runtime. Stop the server with Ctrl+C. Use `PORT=8766 npm run prototype` if the default port is occupied.

The prototype reuses the production tracker, domain logic, translations, floating timer and dialog. Its video events and storage are simulated; it neither reads your real viewing history nor modifies your installed extension. Redirects are intercepted instead of opening external websites.

See [Prototype guide](docs/prototype.md) for the demo script, screen layout, implementation boundaries and portfolio presentation notes.

## Does this project need a frontend and backend?

It needs **separate responsibilities**, but it does not currently need two independently deployed applications.

The settings page and floating timer form the UI. Content scripts observe YouTube playback. A background Service Worker coordinates messages and serializes local writes. Shared domain logic defines the accounting rules. The Service Worker is an **extension background runtime**, not a remote HTTP backend.

A hosted API, authentication system and database would add operating cost and privacy obligations without improving this single-device MVP. Introduce a server only when a concrete requirement such as cross-device synchronization justifies it. See [Technical architecture](docs/architecture.md) for the runtime diagram, persistence model, invariants and tradeoffs.

## Project structure

```text
youtube-time-limiter/
├── manifest.json                  # Chrome entry points and permissions
├── package.json                   # Test, validation and prototype commands
├── src/
│   ├── background/
│   │   └── service-worker.js       # Chrome messaging and the single writer
│   ├── content/
│   │   ├── index.js                # YouTube routes and browser integration
│   │   ├── tracker.js              # Playback lifecycle and elapsed-time tracking
│   │   └── overlay.js              # Floating timer, reminders and end actions
│   ├── options/
│   │   ├── index.html              # Settings interface
│   │   ├── index.js                # Forms, validation and live rendering
│   │   └── styles.css              # Settings styles
│   └── shared/
│       ├── core.js                # Budgets, dates, exclusions and storage queue
│       └── i18n.js                # English/Chinese text dictionary
├── prototype/                     # Runnable demo; never an extension entry point
├── scripts/                       # Entry-point checks and local demo server
├── tests/
│   ├── unit/                      # Isolated domain and presentation tests
│   ├── integration/               # Playback, adapters, forms and packaging
│   └── helpers/                   # Fake DOM, storage and playback fixtures
│   └── helpers/                   # Browser-like test doubles
└── docs/
    ├── architecture.md            # Runtime architecture and design decisions
    ├── project-structure.md        # Ownership, dependencies and change guide
    ├── prototype.md               # Screens, flows and interview demo
    ├── testing.md                 # Automated and manual verification
    └── performance.md             # Stutter investigation and A/B procedure
```

[Project structure guide](docs/project-structure.md) explains where to make changes and why files are grouped by runtime instead of generic `frontend/` and `backend/` folders.

## Time and limit semantics

| Mode | Remaining allowance | If you already watched 3 hours and set a 1-hour limit |
| --- | --- | --- |
| Daily | Daily limit minus today's eligible total, clamped to zero | No time remains; playback pauses |
| Temporary | Temporary limit minus viewing since the latest Start action | A fresh hour remains |

Only active playback counts. Pausing, buffering and seeking stop accrual. Playback at 2× speed still counts elapsed viewing time, not media duration. Background playback and ads in the watch-page player count. Simultaneous videos count separately. Excluded videos do not count.

The default daily allowance is **01:00:00**. Limits can range from **1 second to 24 hours**. Raising a limit, excluding a video or starting a new temporary allowance does not automatically resume a paused video.

Today's total is **automatically recorded time plus a manual correction**. The extension cannot recover viewing before installation or while disabled or broken. If you already watched 3 hours, pause playback and enter `03:00:00` under **Correct today's total**. This sets the total rather than adding another 3 hours. Previously recorded usage is retained; corrections cannot lower the current total.

## End actions and exclusions

**Pause & remind** is the default. The dialog can be dismissed with **Got it** or Esc; the allowance remains enforced. The same limit event does not reopen the dialog on every update.

**Pause & redirect** uses a saved HTTP(S) address and replaces the current tab after pausing. Script/file URLs, embedded credentials and YouTube destinations are rejected. Saving this action while a watch page is already over its limit may redirect that page immediately. Each open watch tab handles its own action.

Add a video URL or ID under **Excluded videos**, or use **Exclude / Include** in the floating timer. URL aliases are matched by the same video ID. Exclusions persist across days. Adding one does not refund earlier viewing time; removing it restores timing and enforcement from that point. Channel-wide and playlist-wide exclusions are not supported.

## Verification

```sh
npm run check                    # Entry points, syntax, versions, then all tests
npm test                         # Automated tests only
TZ=America/New_York npm test      # Repeat with a different local time zone
git diff --check                 # Whitespace/conflict-marker hygiene
```

The suite covers playback states, elapsed-time accounting, repeated listeners and cleanup, SPA/video replacement, concurrent writes, persistence, limits, midnight resets, exclusions, redirects, language changes, settings adapters and extension/prototype entry points. See [Testing guide](docs/testing.md).

Automated tests and a browser prototype smoke test are not a real YouTube decoding or performance benchmark. **The original stutter root cause remains unverified.** No measured FPS or dropped-frame improvement is claimed. The [performance investigation](docs/performance.md) separates confirmed defects from hypotheses and provides a reproducible comparison procedure.

## Known limitations

- Enforcement usually follows the one-second settlement tick plus storage/messaging delay. Background throttling, busy event loops and suspension can delay it further; this is not a hard real-time blocker.
- In-flight intervals can be lost on tab/browser/worker termination. Unload delivery is best effort, and failed writes are not retried with exactly-once guarantees.
- Clock/time-zone changes, OS sleep and unusual player event sequences can affect accounting. Backward wall-clock intervals are rejected.
- Element replacement discovered only by polling can introduce about a tick of boundary error. Exclusion changes can discard not-yet-saved reports for that video.
- Normal fullscreen containers are supported by relocating the overlay. Native video fullscreen and picture-in-picture do not guarantee the overlay is visible.
- A redirect call failure falls back to a dialog. The extension cannot verify that the destination loads successfully or predict its subsequent redirects.
- User-entered labels and URLs are not translated. Native browser validation messages follow the browser's language.
- This is a voluntary personal tool: users can change settings, clear storage or disable it. No parental-control or tamper-resistance claim is made.

## Portfolio and interview use

Present this as a focused browser-systems project: explicit time semantics, a playback state machine, a single-writer consistency boundary, lifecycle cleanup, deterministic tests and a prototype that reuses production UI.

Be precise about what exists: local persistence and tested adapters are implemented; a hosted backend, cross-device sync, store publication and measured playback-performance improvements are not. The architecture document includes the conditions that would justify adding those capabilities.
