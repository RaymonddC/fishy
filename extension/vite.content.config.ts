import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

// Content scripts cannot be ES modules, so each one is built on its own as a
// single self-contained file. Each build adds one file to the main build:
//
//   vite build --config vite.content.config.ts --mode meet-captions
//
// The mode is the name of the script, which keeps the command the same on
// every operating system.
const SCRIPTS = ['meet-captions', 'gmail-open-email'];

export default defineConfig(({ mode }) => {
  if (!SCRIPTS.includes(mode)) {
    throw new Error(`Unknown content script "${mode}". Use --mode with one of: ${SCRIPTS.join(', ')}.`);
  }
  return {
    root,
    publicDir: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      target: 'chrome138',
      modulePreload: false,
      rollupOptions: {
        input: resolve(root, `src/content/${mode}.ts`),
        output: {
          format: 'iife',
          entryFileNames: `content/${mode}.js`,
          inlineDynamicImports: true,
        },
      },
    },
  };
});
