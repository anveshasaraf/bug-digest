import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    // CRXJS HMR needs a stable, predictable port for the dev-mode manifest it injects.
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      // Onboarding isn't referenced anywhere in manifest.json (it's opened
      // dynamically via chrome.tabs.create on install, not declared as a
      // popup/options page), so CRXJS won't discover it on its own.
      input: {
        onboarding: 'src/onboarding/index.html',
      },
    },
  },
});
