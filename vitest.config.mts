import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/**/*.ts'],
      exclude: ['server/vite.ts', 'server/seed.ts'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // 2026-09: server modules throw at import time when DATABASE_URL is
    // missing (see server/db.ts). CI has no DB, so stub the env vars before
    // any test module is loaded. Real DB integration tests should be moved
    // behind a `describe.skipIf(!process.env.REAL_DATABASE_URL)` guard.
    setupFiles: ['./tests/vitest.env-setup.ts'],
  },
});
