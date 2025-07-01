import { resolve } from 'path';
import 'reflect-metadata';
import swc from 'unplugin-swc';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './apps/dmr-server',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      exclude: [...configDefaults.exclude, 'src/main.ts', '**/*.module.ts'],
    },
    // Allow importing from shared libs
    alias: {
      '@dmr/shared': resolve(__dirname, '../../libs/shared/src'),
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
