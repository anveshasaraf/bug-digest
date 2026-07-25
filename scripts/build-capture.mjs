// CRXJS injects manifest-declared content scripts through an async dynamic-import
// loader (see https://github.com/crxjs/chrome-extension-tools/issues/695). That's
// a real gap for capture/main-world.ts specifically: its whole job is to wrap
// console/fetch/XHR/error handling before the page's own scripts run, and the
// loader's await import() reliably loses that race. The documented workaround
// (and the one this project's spec calls out) is to skip the manifest
// declaration and register both capture scripts as genuine, synchronous
// document_start content scripts via chrome.scripting.registerContentScripts
// (see background/index.ts). That API still needs a single self-contained
// script file per world, so build them here, outside CRXJS's pipeline.
import { build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const entries = [
  { entry: 'src/capture/main-world.ts', fileName: 'main-world.js' },
  { entry: 'src/capture/content.ts', fileName: 'content.js' },
];

for (const { entry, fileName } of entries) {
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    build: {
      outDir: path.join(root, 'public/capture'),
      emptyOutDir: false,
      lib: {
        entry: path.join(root, entry),
        formats: ['iife'],
        name: '_bugDigestCapture',
        fileName: () => fileName,
      },
    },
  });
}
