/// <reference types="vitest" />
import { resolve } from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*e2e.spec.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['./src/setup.ts'],
  },
  resolve: {
    alias: {
      '@dmr/shared': resolve(__dirname, '../../../libs/shared/src/index.ts'),
    },
  },
});
