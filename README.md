# bug-digest

Deterministic, local-only error triage for web app developers. Collects
console errors, uncaught exceptions, and failed network requests from the
page you're testing, then (eventually) synthesizes a ranked, plain-English
digest with a one-click LLM-ready markdown export. Zero network egress, zero
accounts, zero analytics — see [PRIVACY.md](./PRIVACY.md) (coming in a later
milestone) for the full story.

**Status:** Milestone 1 (capture plumbing) complete. The processing
pipeline, rules table, and real popup UI land in later milestones — a full
README (architecture, permission justification, contribution guide) is
Milestone 5 work.

## Development

```sh
npm install
npm run dev     # Vite dev server; load dist/ as an unpacked extension
npm run build   # production build -> dist/
npm test        # vitest
npm run lint    # oxlint
```

Load `dist/` via `chrome://extensions` → Developer mode → Load unpacked.

## Why capture scripts aren't declared in the manifest

Both `src/capture/main-world.ts` (MAIN world: console/fetch/XHR/error hooks)
and `src/capture/content.ts` (isolated world: relay to the service worker)
are registered at runtime via `chrome.scripting.registerContentScripts` in
`src/background/index.ts`, instead of the manifest's `content_scripts` key.

CRXJS wraps manifest-declared content scripts in an async dynamic-import
loader (needed for HMR). That loader loses the race against a page's own
`document_start` scripts, which is fatal here — main-world.ts's entire job is
installing hooks *before* the page's own code runs. `registerContentScripts`
gets Chrome to inject both scripts synchronously at `document_start`, with no
loader gap. `scripts/build-capture.mjs` bundles each into a single
self-contained IIFE (no runtime imports) so they can be injected as plain
classic scripts; run `npm run build:capture` after editing either file in
dev mode (no HMR for these two — a known trade-off, see
[crxjs/chrome-extension-tools#695](https://github.com/crxjs/chrome-extension-tools/issues/695)).

## Test fixture

`test/fixture/index.html` deterministically fires one of each event kind
(console.error, uncaught exception, unhandled rejection, failed fetch,
failed XHR) — serve it locally (e.g. `python3 -m http.server 8123 --directory
test/fixture`) and open `?auto=1` to fire all five on load.
