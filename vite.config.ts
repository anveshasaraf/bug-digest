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
});
