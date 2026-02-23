import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { 'bin/cli': 'src/bin/cli.ts' },
    format: ['esm'],
    target: 'node18',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: false,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node18',
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: true,
  },
]);
