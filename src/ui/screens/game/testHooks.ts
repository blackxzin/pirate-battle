import type { GameSession } from '../../../session/gameSession';

export interface PirateBattleTestApi {
  readonly manualClock: boolean;
  snapshot(): ReturnType<GameSession['snapshot']>;
  /** Advances simulated time (only while running). */
  advance(ms: number): void;
  spawnEnemy(kind: 'chaser' | 'shooter', x: number, y: number, angle?: number): number;
  perf(): ReturnType<GameSession['perfStats']>;
}

declare global {
  interface Window {
    __PIRATE_BATTLE__?: PirateBattleTestApi;
  }
}

/**
 * Test instrumentation (enabled with `?e2e`). It can observe state and control
 * the clock, but inputs still go through real keyboard/pointer events and the
 * real rules, collisions and rendering run unchanged.
 */
export function exposeTestHooks(session: GameSession): () => void {
  const api: PirateBattleTestApi = {
    manualClock: session.isManualClock,
    snapshot: () => session.snapshot(),
    advance: (ms) => session.advance(ms),
    spawnEnemy: (kind, x, y, angle) => session.spawnEnemy(kind, x, y, angle),
    perf: () => session.perfStats(),
  };
  window.__PIRATE_BATTLE__ = api;
  return () => {
    if (window.__PIRATE_BATTLE__ === api) delete window.__PIRATE_BATTLE__;
  };
}
