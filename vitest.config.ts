import { defineConfig } from 'vitest/config';

/**
 * Unit and integration tests for the non-visual code (rules, API, mocks,
 * storage, input, clock). React screens and the Pixi renderer are covered by
 * the Playwright suite instead.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reportsDirectory: 'reports/coverage',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'src/game/**',
        'src/api/**',
        'src/mocks/**',
        'src/storage/**',
        'src/session/clock.ts',
        'src/session/store.ts',
        'src/session/input.ts',
        'src/ui/format.ts',
        'src/ui/router.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.tsx', 'src/mocks/browser.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
