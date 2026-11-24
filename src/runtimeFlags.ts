/**
 * Flags read once from the query string:
 * - `e2e`            exposes `window.__PIRATE_BATTLE__` test instrumentation;
 * - `clock=manual`   the simulation only advances through `advance(ms)`;
 * - `seed=<int>`     fixed RNG seed for reproducible spawns;
 * - `scenario=<id>`  selects a mock network scenario (see mocks/scenarios.ts);
 * - `profile`        (with `e2e`) the player cannot sink, so profiling can run one
 *                    full 3-minute match at maximum load. Only config values change.
 */
export interface RuntimeFlags {
  readonly testHooks: boolean;
  readonly manualClock: boolean;
  readonly seed: number | null;
  readonly profiling: boolean;
}

export function readRuntimeFlags(search: string): RuntimeFlags {
  const params = new URLSearchParams(search);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  return {
    testHooks: params.has('e2e'),
    manualClock: params.get('clock') === 'manual',
    seed: Number.isFinite(seed) ? seed : null,
    profiling: params.has('e2e') && params.has('profile'),
  };
}

export const runtimeFlags: RuntimeFlags = readRuntimeFlags(typeof window === 'undefined' ? '' : window.location.search);
