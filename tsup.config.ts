import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
    dts: true,
  },
  // Self-contained single-file build bundled into the skill folder, so the
  // skill can be dropped into Claude Cowork / Claude Code and run with plain
  // `node` — no npm install required.
  {
    entry: { bamboohr: 'src/index.ts' },
    format: ['esm'],
    target: 'node20',
    outDir: 'skills/bamboohr/scripts',
    clean: false,
    sourcemap: false,
    dts: false,
    splitting: false,
    noExternal: [/.*/],
    banner: {
      // createRequire shim: commander/undici are CJS and esbuild's ESM output
      // needs a real require for their built-in module imports.
      js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
  },
]);
