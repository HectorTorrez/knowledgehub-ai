import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    setupFiles: ['./test/setup-env.ts'],
    include: ['**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
