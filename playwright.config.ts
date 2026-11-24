import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const DEV_PORT = 5173;

/** Profiling specs run only with PERF=1 (`npm run perf`); dev-server specs only in their project. */
const BUILD_IGNORED = [/\.dev\.spec\.ts$/, ...(process.env.PERF ? [] : [/\.perf\.spec\.ts$/])];

/**
 * Headless Chromium renders WebGL on the CPU (SwiftShader) by default. With
 * PERF_GPU=1 the profiling run uses the machine's GPU through ANGLE instead.
 */
const GPU_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'];

/**
 * E2E against the production build (`vite preview`), so the published mocks
 * and assets are exercised exactly as deployed. Main flows run on desktop and
 * mobile (landscape, touch) Chromium.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.015, animations: 'disabled', caret: 'hide' },
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // One retry absorbs rare browser-process crashes under memory pressure; the
  // HTML report still flags any test that needed it as flaky.
  retries: 1,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'reports/playwright' }]],
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: process.env.PERF_GPU ? { args: GPU_ARGS } : {},
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: BUILD_IGNORED,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile-chromium',
      testIgnore: BUILD_IGNORED,
      use: { ...devices['Pixel 7 landscape'] },
    },
    {
      // React Strict Mode double-invokes effects only in development builds.
      name: 'strict-mode-dev',
      testMatch: /\.dev\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, baseURL: `http://localhost:${DEV_PORT}` },
    },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview',
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: 'npm run dev',
      url: `http://localhost:${DEV_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
