import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    setupFiles: ['./test/setup-env.ts'],
    include: ['**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.eval.e2e-spec.ts'],
    // Claiming drains a global queue, so tests cannot share this database in parallel.
    fileParallelism: false,
  },
});
