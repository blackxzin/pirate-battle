/**
 * Runs the E2E suite against the published deploy (no local server):
 * `npm run test:e2e:live`, or `LIVE_URL=https://… npm run test:e2e:live`.
 * The dev-server Strict Mode project is skipped; it needs a local dev build.
 */
import base from './playwright.config';
import { defineConfig } from '@playwright/test';

const LIVE_URL = process.env.LIVE_URL ?? 'https://pirate-battle-ashy.vercel.app';

export default defineConfig({
  ...base,
  webServer: undefined,
  reporter: [['list']],
  outputDir: 'test-results-live',
  projects: (base.projects ?? [])
    .filter((project) => project.name !== 'strict-mode-dev')
    .map((project) => ({ ...project, use: { ...project.use, baseURL: LIVE_URL } })),
});
