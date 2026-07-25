# bug-digest

A Manifest V3 Chrome extension that collects everything devtools knows about a page — console errors, uncaught exceptions, failed network requests — and turns it into a **ranked, deduplicated, plain-English digest**, with a one-click, LLM-ready markdown export.

The problem devtools has isn't missing information — it's noise. A hundred console lines show up and three of them matter. bug-digest deterministically finds the three, explains them, collapses the other ninety-seven, and formats the result for pasting into Claude, ChatGPT, or Claude Code.

**Who it's for:** primarily people who can't fluently read devtools yet and whose debug loop is copy-paste-into-an-LLM — beginners and AI-assisted ("vibe coding") builders. It's just as useful for experienced developers who want the full technical detail one click away.

## Hard constraints

- **100% deterministic. Zero LLM calls, zero network requests of any kind, zero backend, zero accounts, zero analytics.** The "AI feature" is the quality of the markdown export — consumed by *your* AI tool, not ours.
- **Open source, MIT licensed.**
- **Plain-English first, full technical depth one click away.** Nothing is ever omitted, only layered.
- **Privacy by construction**, not by policy — see [PRIVACY.md](./PRIVACY.md).

## Install (unpacked, for now — not yet store-published)

```sh
npm install
npm run build
```

Then `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/`.

## How it works

### Capture

A script runs in the page's **MAIN world** (the only place that can see the page's own `console`/`fetch`/`XMLHttpRequest`, since content scripts run isolated from the page by default) and wraps:

- `console.error` / `console.warn` — pass-through, never altered or swallowed
- `window` `error` / `unhandledrejection` events — listened to via `addEventListener`, never assigned over `window.onerror`, so any handler the page already set keeps running
- `fetch` and `XMLHttpRequest` — records method, URL, status, and duration for **failures only** (status ≥ 400 or a network-level error)

It posts each observation via `window.postMessage` to an isolated-world content script, which validates the shape and relays it to the background service worker, which keeps a **per-tab ring buffer** (last ~200 events, current-page + previous-page so a refresh-loop bug stays inspectable for one navigation).

Both scripts are registered at runtime via `chrome.scripting.registerContentScripts`, not declared in the manifest. CRXJS (the build tool) wraps manifest-declared content scripts in an async dynamic-import loader needed for hot-reload — and that loader reliably loses the race against a page's own `document_start` scripts, which is fatal for a script whose entire job is installing hooks *before* the page runs. `scripts/build-capture.mjs` bundles both scripts into self-contained files precisely so they can be injected synchronously, with no loader gap. See [crxjs/chrome-extension-tools#695](https://github.com/crxjs/chrome-extension-tools/issues/695) for the underlying issue.

### The processing pipeline

Five pure, independently unit-tested functions (`src/lib/pipeline/`), composed in `buildDigest()`:

1. **Dedupe** (`dedupe.ts`) — identical messages anywhere in the stream collapse into one entry with a count and first/last timestamps.
2. **Noise filter** (`noise.ts`) — a maintained ignore-list (favicon 404s, sourcemap 404s, other-extension chatter, ad-blocker blocks) filters known-meaningless entries. Filtered items are counted and sampled, **never silently dropped**.
3. **Severity** (`severity.ts`) — uncaught exception/rejection > same-origin failed request > console.error > third-party failed request > console.warn.
4. **Correlation** (`correlate.ts`) — events within ~1.5s of each other are grouped into one incident (e.g. a failed request immediately followed by the console.error it caused), so the digest reads "1 incident," not "2 unrelated rows." This is a deliberately simple heuristic (time proximity only) traded for determinism — see the file for the exact rule.
5. **Rule matching** (`match.ts` + `src/rules/rules.ts`) — each incident is matched against a community-editable rules table for a plain-English title, technical explanation, and fixes. Unmatched incidents get an honest generic framing, never a fabricated diagnosis.

The final digest is sorted by severity (then by the finer-grained per-kind rank, then chronologically) — so the page reads with the worst problem first, not just the most recent one.

### The rules table

`src/rules/rules.ts` is a plain typed array — adding a rule is a data change, not an engine change. See [CONTRIBUTING.md](./CONTRIBUTING.md).

Two known gaps, documented in code comments rather than hidden: `Rule.match` only sees an `Incident`, not the page's origin, so rules can't reliably distinguish same-origin from cross-origin failures the way a couple of the rule names imply. And CSP-violation / mixed-content rules are best-effort — those are typically native DevTools messages, not real `console.error()` calls, so the capture layer would need a `securitypolicyviolation` listener to catch them reliably (not yet implemented).

### The popup

Ranked incident cards (severity badge, plain-English title, occurrence count, relative time) that expand into the full technical layer: raw message, stack, file:line, request method/URL/status/duration, the event timeline, and the matched rule's technical explanation and fixes. A collapsed, expandable noise section keeps the filtered count inspectable. **Copy for AI** serializes the entire technical digest as markdown (`src/lib/markdown.ts`) — every field round-trips, nothing gets summarized away for the LLM's sake.

The toolbar badge shows the current tab's open incident count: red if anything is critical, gray for warnings-only, empty when clean — updated live as events arrive and cleared on navigation.

## Permissions, and why

| Permission | Why |
|---|---|
| `storage` | The per-site enable/disable toggle (`chrome.storage.local`). Nothing else is persisted. |
| `activeTab` + `<all_urls>` host permission | The capture layer has to work on *any* localhost port and any staging domain a developer might be testing against — there's no way to know those in advance, so it can't be scoped narrower. |
| `scripting` | Registers the capture scripts at runtime (see above) instead of declaring them in the manifest. |

There is no `downloads` permission — the screenshot button saves via a plain anchor `download` attribute instead of the `chrome.downloads` API, deliberately trading a slightly less native download UX for one fewer permission. There is no analytics, telemetry, or remote logging of any kind; the capture layer is dormant until a page produces an error, and even then nothing ever leaves the browser. See [PRIVACY.md](./PRIVACY.md).

## Project structure

```
bug-digest/
  src/
    capture/main-world.ts     # console/fetch/XHR/error wrapping, postMessage relay
    capture/content.ts        # isolated-world validator + relay to worker
    background/index.ts       # per-tab ring buffers, digest, badge, capture-script registration
    lib/pipeline/              # dedupe.ts, noise.ts, severity.ts, correlate.ts, match.ts — pure + tested
    lib/redact.ts              # URL token redaction — pure + tested
    lib/markdown.ts            # copy-for-AI serializer — pure + tested
    lib/storage.ts             # per-site enable/disable
    rules/rules.ts              # the community rules table
    popup/                      # React digest UI
    onboarding/                 # first-run onboarding page
  test/fixture/                 # static page that deterministically fires a scripted set of errors/requests
  scripts/build-capture.mjs     # standalone IIFE bundler for the two capture scripts (see above)
  CONTRIBUTING.md
  PRIVACY.md
  LICENSE
```

## Development

```sh
npm install
npm run dev       # Vite dev server; load dist/ as an unpacked extension
npm run build      # production build -> dist/
npm test           # vitest
npm run lint       # oxlint
```

`npm run dev` and `npm run build` both run `scripts/build-capture.mjs` first — the two capture scripts are bundled outside CRXJS's normal pipeline (see above) and don't get Vite's hot-reload; run `npm run build:capture` after editing either one.

## Test fixture

`test/fixture/index.html` deterministically fires one of each event kind (console.error, uncaught exception, unhandled rejection, failed fetch, failed XHR) — serve it locally and open with `?auto=1` to fire all five on load:

```sh
python3 -m http.server 8123 --directory test/fixture
# then open http://localhost:8123/?auto=1
```

## Contributing

The most common contribution is adding a rule to the table — see [CONTRIBUTING.md](./CONTRIBUTING.md), it's a data change, not an engine change.

## License

MIT — see [LICENSE](./LICENSE).
