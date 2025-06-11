import swc from 'unplugin-swc';
import { configDefaults, defineConfig } from 'vitest/config';

// The file has .mts extension since CJS build of Vite is deprecated
// https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated
export default defineConfig({
  test: {
    globals: true,
    root: './',
    coverage: {
      exclude: [...configDefaults.exclude, 'src/main.ts', '**/*.module.ts'],
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
