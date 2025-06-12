import path from 'path';
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    environment: 'node',
    root: './',
  },
  resolve: {
    alias: {
      '@dmr/shared': path.resolve(__dirname, '../../libs/shared/src'),
      '@src': path.resolve(__dirname, './src'),
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
