# Usage guide

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


## Known limitations

- Enforcement usually follows the one-second settlement tick plus storage/messaging delay. Background throttling, busy event loops and suspension can delay it further; this is not a hard real-time blocker.
- In-flight intervals can be lost on tab/browser/worker termination. Unload delivery is best effort, and failed writes are not retried with exactly-once guarantees.
- Clock/time-zone changes, OS sleep and unusual player event sequences can affect accounting. Backward wall-clock intervals are rejected.
- Element replacement discovered only by polling can introduce about a tick of boundary error. Exclusion changes can discard not-yet-saved reports for that video.
- Normal fullscreen containers are supported by relocating the overlay. Native video fullscreen and picture-in-picture do not guarantee the overlay is visible.
- A redirect call failure falls back to a dialog. The extension cannot verify that the destination loads successfully or predict its subsequent redirects.
- User-entered labels and URLs are not translated. Native browser validation messages follow the browser's language.
- This is a voluntary personal tool: users can change settings, clear storage or disable it. No parental-control or tamper-resistance claim is made.
