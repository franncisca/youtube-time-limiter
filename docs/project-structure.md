# Project structure and contribution guide

## Organize by execution environment

The previous root-level scripts made the prototype easy to start but obscured ownership as features grew. Files now sit next to the runtime they belong to. The root manifest remains the installation entry point; moving it into `src` would make unpacked loading less obvious.

| Directory | Ownership | Typical change |
| --- | --- | --- |
| `src/background` | Chrome Service Worker adapter | Add a browser-only message operation |
| `src/content` | Watch-page lifecycle, playback and overlay | Handle a media event or change the floating UI |
| `src/options` | Settings page | Add a preference form or improve layout |
| `src/shared` | Domain rules and localization | Change allowance rules, normalization or translations |
| `tests/unit` | Isolated module behavior | Add a domain or presentation regression |
| `tests/integration` | Production modules working together | Verify playback, browser adapters or settings flows |
| `tests/helpers` | Shared doubles and controlled fixtures | Add a browser API behavior to a fake |
| `prototype` | Simulated interactive demo | Add an interview scenario, never production state |
| `scripts` | Development tooling | Validate entry points or serve the prototype |
| `docs` | Architecture, product flows and evidence | Explain a tradeoff or record a verified result |

## Dependency rules

- Shared domain logic must not query the DOM or depend on `chrome`.
- The tracker receives its video lookup, messaging, clocks and scheduling functions. Keep browser wiring in the content adapter.
- Settings and content scripts send messages; the background owns durable writes.
- Presentation must not create a second timing implementation.
- Production source must not import prototype adapters or test helpers.
- The prototype may import production source. The reverse dependency is forbidden.

These are logical modules within one extension, not independent deployable frontend/backend services.

## Change checklist

For a new setting:

1. Define its default, validation, persistence and rollover behavior in `src/shared/core.js`.
2. Add the settings control and a command in `src/options`.
3. Add a stable English message ID to both dictionaries in `src/shared/i18n.js`; keep translated copy out of application code. Domain validation uses `error.*` IDs, translated at the UI boundary.
4. Consume the persisted state in the tracker or overlay as appropriate.
5. Add behavioral tests and update the relevant documentation.

For file moves, update `manifest.json`, HTML asset references, worker imports and test fixtures together. Run `npm run check`; it validates real entry paths, script syntax and matching package/manifest versions before tests.

For UI work, run `npm run prototype`. Use the production settings screen and floating timer under simulated data before asking someone to manually test the installed extension. Keep prototype and real-browser results distinct in reports.

## Migration from the flat layout

| Previous file | Current file |
| --- | --- |
| `background.js` | `src/background/service-worker.js` |
| `content.js` | `src/content/index.js` |
| `tracker.js` | `src/content/tracker.js` |
| `overlay.js` | `src/content/overlay.js` |
| `options.html` | `src/options/index.html` |
| `options.js` | `src/options/index.js` |
| `styles.css` | `src/options/styles.css` |
| `core.js` | `src/shared/core.js` |
| `i18n.js` | `src/shared/i18n.js` |
| `tests/fake-dom.cjs` | `tests/helpers/fake-dom.cjs` |

The refactor does not rename the storage key or delete valid user preferences. Reload the unpacked extension from the same repository root and refresh open YouTube/settings pages. Existing Chinese preferences remain selected, while missing language preferences now default to English.

## What is intentionally absent

There is no framework, package installation step, cloud API, database, authentication service, deployment pipeline or compiled distribution. The project remains small enough to inspect directly. Add tools when a concrete maintenance or product requirement warrants them, not to inflate the architecture.
