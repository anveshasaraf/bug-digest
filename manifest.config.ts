import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Bug Digest',
  description:
    'Deterministic, local-only error triage for web app developers. Collects console errors, uncaught exceptions, and failed network requests, then synthesizes a ranked, plain-English digest with a one-click LLM-ready markdown export. Zero network egress, zero accounts, zero analytics.',
  version: pkg.version,
  icons: {
    16: 'icons/icon-16.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'icons/icon-16.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
  // No static content_scripts entry: CRXJS wraps manifest-declared content
  // scripts in an async dynamic-import loader (needed for HMR), and that
  // loader loses the race against the page's own document_start scripts —
  // fatal for a script whose entire job is installing hooks before the page
  // runs (see scripts/build-capture.mjs). Both capture scripts are instead
  // registered natively via chrome.scripting.registerContentScripts in
  // background/index.ts, which Chrome injects synchronously at document_start.
});
