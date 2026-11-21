import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// Content scripts cannot be ES modules, so each one is built on its own as a
// single self-contained file. This runs after the main build and adds to it.
export default defineConfig({
  root,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome138',
    modulePreload: false,
    rollupOptions: {
      input: resolve(root, 'src/content/meet-captions.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'content/meet-captions.js',
        inlineDynamicImports: true,
      },
    },
  },
});
