import { resolve } from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.e2e-spec.ts'],
    environment: 'node',
    root: __dirname,
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@src': resolve(__dirname, '/src'),
      test: resolve(__dirname, '/test'),
      '@dmr/shared': resolve(__dirname, '../../libs/shared/src'),
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
