import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['**/*.e2e-spec.ts'],
    environment: 'node',
    root: __dirname,
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@src': __dirname + '/src',
      test: __dirname + '/test',
    },
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: false,
          decorators: true,
        },
        target: 'es2022',
        transform: {
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
