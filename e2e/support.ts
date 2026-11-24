import { test as base, expect, type Page } from '@playwright/test';
import type {} from '../src/ui/screens/game/testHooks';

export interface SnapshotShip {
  id: number;
  kind: 'player' | 'chaser' | 'shooter';
  x: number;
  y: number;
  angle: number;
  speed: number;
  health: number;
  maxHealth: number;
  cooldowns: Record<'front' | 'left' | 'right' | 'enemy', number>;
}

export interface GameSnapshot {
  status: 'running' | 'ended';
  phase: 'running' | 'paused' | 'ended';
  endReason: 'time_up' | 'defeated' | null;
  score: number;
  elapsed: number;
  timeLeft: number;
  player: SnapshotShip;
  enemies: SnapshotShip[];
  projectiles: number;
  spawned: { chaser: number; shooter: number };
}

export interface OpenOptions {
  readonly hash?: string;
  readonly scenario?: string;
  readonly seed?: number;
  readonly manualClock?: boolean;
  /** Profiling: the player cannot sink (config override, see runtimeFlags). */
  readonly profile?: boolean;
  /** Pre-seeds options in localStorage (only on the first load of the test). */
  readonly options?: { sessionSeconds: number; spawnIntervalSeconds: number; soundEnabled?: boolean };
}

/**
 * Library deprecation notices (PixiJS logs "Deprecation Warning … Deprecated
 * since vX" as plain messages). Browser notices about the test machine itself,
 * such as headless Chromium's software-WebGL fallback, are not matched.
 */
const DEPRECATION = /Deprecation Warning|Deprecated since/i;

/**
 * Every test fails on console errors and on library deprecation notices.
 * Tests that deliberately simulate network failures call
 * `consoleGuard.allowNetworkErrors()` to ignore the browser's "Failed to load
 * resource" noise (handled errors are still caught).
 */
type Fixtures = { consoleGuard: { allowNetworkErrors: () => void; allow: (pattern: RegExp) => void } };

export const test = base.extend<Fixtures>({
  consoleGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      let networkErrorsAllowed = false;
      const allowed: RegExp[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' || DEPRECATION.test(message.text())) errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      await use({
        allowNetworkErrors: () => {
          networkErrorsAllowed = true;
        },
        allow: (pattern) => {
          allowed.push(pattern);
        },
      });
      const unexpected = errors
        .filter((text) => !networkErrorsAllowed || !/Failed to load resource|net::ERR/i.test(text))
        .filter((text) => !allowed.some((pattern) => pattern.test(text)));
      expect(unexpected, 'unexpected console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function openApp(page: Page, opts: OpenOptions = {}): Promise<void> {
  const params = new URLSearchParams();
  params.set('e2e', '1');
  if (opts.manualClock !== false) params.set('clock', 'manual');
  params.set('seed', String(opts.seed ?? 1));
  if (opts.scenario) params.set('scenario', opts.scenario);
  if (opts.profile) params.set('profile', '1');
  if (opts.options) {
    const options = { soundEnabled: false, ...opts.options };
    await page.addInitScript((value) => {
      if (!sessionStorage.getItem('__seeded__')) {
        localStorage.setItem('pirate-battle:options:v1', JSON.stringify(value));
        sessionStorage.setItem('__seeded__', '1');
      }
    }, options);
  } else {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('__seeded__')) {
        localStorage.setItem(
          'pirate-battle:options:v1',
          JSON.stringify({ sessionSeconds: 120, spawnIntervalSeconds: 3, soundEnabled: false }),
        );
        sessionStorage.setItem('__seeded__', '1');
      }
    });
  }
  await page.goto(`/?${params.toString()}${opts.hash ?? '#/'}`);
}

export async function startBattle(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await page.waitForFunction(() => window.__PIRATE_BATTLE__ !== undefined);
}

export function snapshot(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => window.__PIRATE_BATTLE__!.snapshot() as unknown as GameSnapshot);
}

export async function advance(page: Page, ms: number): Promise<void> {
  await page.evaluate((value) => window.__PIRATE_BATTLE__!.advance(value), ms);
}

/** Holds keys while advancing simulated time; inputs go through real key events. */
export async function hold(page: Page, keys: readonly string[], ms: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await advance(page, ms);
  for (const key of keys) await page.keyboard.up(key);
}

export async function spawnEnemy(page: Page, kind: 'chaser' | 'shooter', x: number, y: number, angle?: number): Promise<number> {
  return page.evaluate(([k, px, py, a]) => window.__PIRATE_BATTLE__!.spawnEnemy(k, px, py, a), [kind, x, y, angle] as const);
}

/** Plays until the match ends by time (in 1 s chunks of simulated time). */
export async function runToEnd(page: Page, maxSeconds = 200): Promise<void> {
  await page.evaluate((limit) => {
    const api = window.__PIRATE_BATTLE__!;
    for (let i = 0; i < limit && api.snapshot().status === 'running'; i += 1) api.advance(1000);
  }, maxSeconds);
}
