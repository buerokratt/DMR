import swc from 'unplugin-swc';
import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    root: './apps/dmr-agent',
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
