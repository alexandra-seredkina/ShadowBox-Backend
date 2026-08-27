import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/** Runs against a real PostgreSQL from DATABASE_URL; tables are wiped between tests. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    globalSetup: ['./test/support/integration-setup.ts'],
    fileParallelism: false,
  },
});
