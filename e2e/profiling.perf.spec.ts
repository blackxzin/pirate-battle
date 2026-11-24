import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CDPSession, Page } from '@playwright/test';
import { expect, openApp, startBattle, test } from './support';

/**
 * Performance evidence (run with `npm run perf`, not part of the default suite).
 * - Combat: real-time clock, optimized build, 3 minutes of active play with
 *   scripted inputs; samples FPS, p95 frame time and entity count.
 * - Memory: 5 cycles of start → play → exit, forcing GC and reading the JS heap.
 */
const REPORT_DIR = join(process.cwd(), 'reports', 'perf');
/** `gpu` when run with PERF_GPU=1, otherwise `software` (SwiftShader). */
const RENDERER = process.env.PERF_GPU ? 'gpu' : 'software';
/** CPU slowdown applied through CDP (PERF_CPU_THROTTLE=4 approximates a mid-range phone). */
const CPU_THROTTLE = Math.max(1, Number(process.env.PERF_CPU_THROTTLE ?? 1));
const TARGET_SECONDS = 180;
const SAMPLE_EVERY_MS = 15_000;

interface Sample {
  readonly atSeconds: number;
  readonly averageFps: number;
  readonly p95FrameMs: number;
  readonly maxEntities: number;
  readonly enemies: number;
  readonly projectiles: number;
}

/** Report file suffix, e.g. `gpu`, `gpu-mobile` or `gpu-mobile-cpu4x`. */
function reportLabel(projectName: string): string {
  const parts = [RENDERER];
  if (projectName.startsWith('mobile')) parts.push('mobile');
  if (CPU_THROTTLE > 1) parts.push(`cpu${CPU_THROTTLE}x`);
  return parts.join('-');
}

async function throttleCpu(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  if (CPU_THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  return cdp;
}

async function heapUsedMb(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
  return Number((used / 1024 / 1024).toFixed(2));
}

async function readSample(page: Page, atSeconds: number): Promise<Sample | null> {
  return page.evaluate((at) => {
    const api = window.__PIRATE_BATTLE__;
    if (!api) return null;
    const perf = api.perf();
    const state = api.snapshot();
    return {
      atSeconds: at,
      averageFps: Number(perf.averageFps.toFixed(1)),
      p95FrameMs: perf.p95FrameMs,
      maxEntities: perf.maxEntities,
      enemies: state.enemies.length,
      projectiles: state.projectiles,
    };
  }, atSeconds);
}

test.describe.configure({ mode: 'serial' });

test('3-minute combat profile', async ({ page }, testInfo) => {
  test.setTimeout(TARGET_SECONDS * 1000 + 120_000);
  await throttleCpu(page);
  // One full 3-minute match. With `profile` the player cannot sink (a config
  // override), so enemies keep spawning up to the cap: a worst-case load.
  await openApp(page, { manualClock: false, profile: true, seed: 11, options: { sessionSeconds: TARGET_SECONDS, spawnIntervalSeconds: 2 } });
  await startBattle(page);

  // Sail in a wide circle while firing everything: a busy, representative load.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  const samples: Sample[] = [];
  const startedAt = Date.now();
  while (!page.url().endsWith('#/result') && Date.now() - startedAt < (TARGET_SECONDS + 10) * 1000) {
    await page.keyboard.down('KeyD');
    await page.keyboard.press('KeyQ');
    await page.waitForTimeout(700);
    await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1300);
    const elapsed = (Date.now() - startedAt) / 1000;
    if (samples.length === 0 || elapsed - (samples.at(-1)?.atSeconds ?? 0) >= SAMPLE_EVERY_MS / 1000) {
      const sample = await readSample(page, Math.round(elapsed));
      if (sample) samples.push(sample);
    }
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Space');
  await expect(page).toHaveURL(/#\/result$/, { timeout: 20_000 });
  await expect(page.getByTestId('result-meta')).toContainText('03:00');

  const environment = await page.evaluate(() => ({
    webglRenderer: (() => {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    })(),
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
  }));
  const label = reportLabel(testInfo.project.name);
  const worstP95 = Math.max(...samples.map((sample) => sample.p95FrameMs));
  const minFps = Math.min(...samples.map((sample) => sample.averageFps));
  const maxEntities = Math.max(...samples.map((sample) => sample.maxEntities));
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    join(REPORT_DIR, `combat-profile-${label}.json`),
    JSON.stringify(
      { environment: { ...environment, project: testInfo.project.name, cpuThrottle: CPU_THROTTLE }, config: { sessionSeconds: TARGET_SECONDS, spawnIntervalSeconds: 2, seed: 11, playerCannotSink: true }, samples, summary: { minFps, worstP95, maxEntities } },
      null,
      2,
    ),
  );
  expect(samples.length).toBeGreaterThan(5);
});

test('memory after 5 start/play/exit cycles', async ({ page }, testInfo) => {
  test.setTimeout(240_000 * CPU_THROTTLE);
  const cdp = await throttleCpu(page);
  await cdp.send('Performance.enable');
  await openApp(page, { manualClock: false, seed: 5, options: { sessionSeconds: 60, spawnIntervalSeconds: 1 } });
  const baseline = await heapUsedMb(cdp);
  const cycles: Array<{ cycle: number; heapMb: number; canvases: number }> = [];

  for (let cycle = 1; cycle <= 5; cycle += 1) {
    await startBattle(page);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await page.waitForTimeout(8000);
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    cycles.push({ cycle, heapMb: await heapUsedMb(cdp), canvases: await page.locator('canvas').count() });
  }

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, `memory-cycles-${reportLabel(testInfo.project.name)}.json`), JSON.stringify({ baselineMb: baseline, cycles }, null, 2));
  expect(cycles.every((entry) => entry.canvases === 0)).toBe(true);
  const growth = (cycles.at(-1)?.heapMb ?? 0) - (cycles[0]?.heapMb ?? 0);
  expect(growth).toBeLessThan(15);
});
