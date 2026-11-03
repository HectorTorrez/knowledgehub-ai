import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    setupFiles: ['./test/setup-env.ts'],
    include: ['eval/retrieval.eval.e2e-spec.ts'],
    fileParallelism: false,
  },
});
