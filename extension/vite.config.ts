import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const manifestPath = resolve(root, 'manifest.json');

/** Copies manifest.json into the build so `dist` can be loaded as an unpacked extension. */
function extensionManifest(): Plugin {
  return {
    name: 'fishy-extension-manifest',
    buildStart() {
      this.addWatchFile(manifestPath);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: readFileSync(manifestPath, 'utf8') });
    },
  };
}

export default defineConfig({
  root,
  // Relative asset paths, because the page is served from chrome-extension://
  base: './',
  plugins: [extensionManifest()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome138',
    // Chrome 138 and newer preload modules natively, so no helper code is needed.
    modulePreload: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(root, 'src/sidepanel/index.html'),
        'service-worker': resolve(root, 'src/background/service-worker.ts'),
      },
      output: {
        // The manifest names the service worker, so its file name must not change.
        entryFileNames: (chunk) => (chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
