import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ccsandbox/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@ccsandbox/server': resolve(__dirname, 'packages/server/src/index.ts'),
    },
  },
  test: {
    globals: false,
    include: ['packages/**/src/**/*.test.ts'],
  },
});
