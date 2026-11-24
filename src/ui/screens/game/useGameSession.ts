import { useCallback, useEffect, useState } from 'react';
import { BASE_CONFIG, createGameConfig, type GameConfig } from '../../../game/config';
import { randomSeed } from '../../../game/rng';
import { AssetLoadError, loadGameTextures, type GameTextures } from '../../../render/assets';
import { runtimeFlags } from '../../../runtimeFlags';
import { GameSession, SessionStartError, type MatchOutcome } from '../../../session/gameSession';
import { loadOptions } from '../../../storage/preferences';
import { exposeTestHooks } from './testHooks';

export type LoadState =
  | { readonly status: 'loading'; readonly progress: number }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly textures: GameTextures };

/** Loads textures with progress; `retry` reloads after a failure. */
export function useGameTextures(): { readonly state: LoadState; readonly retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: 'loading', progress: 0 });

  useEffect(() => {
    let cancelled = false;
    // Once the load settles (e.g. one atlas failed), late progress events from
    // the other atlases must not overwrite the error with "loading".
    let settled = false;
    loadGameTextures((progress) => {
      if (!cancelled && !settled) setState({ status: 'loading', progress });
    })
      .then((textures) => {
        settled = true;
        if (!cancelled) setState({ status: 'ready', textures });
      })
      .catch((error: unknown) => {
        settled = true;
        if (cancelled) return;
        console.warn('Asset loading failed', error);
        const message = error instanceof AssetLoadError ? error.message : 'Could not load the game assets.';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading', progress: 0 });
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}

export interface StartedMatch {
  readonly session: GameSession;
  readonly options: { readonly sessionSeconds: number; readonly spawnIntervalSeconds: number };
}

/** Profiling only (`?e2e&profile`): a player that cannot sink, through config alone. */
const PROFILING_OVERRIDES: Partial<GameConfig> = {
  player: { ...BASE_CONFIG.player, maxHealth: 1_000_000 },
};

/** A renderer that has not started by then is reported, with a Retry. */
export const SESSION_START_TIMEOUT_MS = 20_000;

export interface GameSessionState {
  readonly match: StartedMatch | null;
  /** User-facing reason when the match could not start. */
  readonly startError: string | null;
  readonly retryStart: () => void;
}

/**
 * Creates the session once textures are ready and destroys it on unmount.
 * Handles React Strict Mode: the async init may resolve after the first
 * (simulated) unmount, in which case the orphan session is destroyed at once.
 */
export function useGameSession(
  host: HTMLElement | null,
  textures: GameTextures | null,
  onEnd: (outcome: MatchOutcome, options: StartedMatch['options']) => void,
): GameSessionState {
  const [match, setMatch] = useState<StartedMatch | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!host || !textures) return undefined;
    let disposed = false;
    let created: GameSession | null = null;
    let removeHooks: (() => void) | null = null;
    const playerOptions = loadOptions();
    const options = { sessionSeconds: playerOptions.sessionSeconds, spawnIntervalSeconds: playerOptions.spawnIntervalSeconds };
    const startTimer = window.setTimeout(() => {
      if (disposed || created) return;
      // Give up on this attempt: a late session is destroyed when it resolves.
      disposed = true;
      setStartError('The battle is taking too long to start. Your device may be busy.');
    }, SESSION_START_TIMEOUT_MS);

    GameSession.create({
      host,
      textures,
      config: createGameConfig(options, runtimeFlags.profiling ? PROFILING_OVERRIDES : {}),
      seed: runtimeFlags.seed ?? randomSeed(),
      manualClock: runtimeFlags.manualClock,
      onEnd: (outcome) => onEnd(outcome, options),
    })
      .then((session) => {
        window.clearTimeout(startTimer);
        if (disposed) {
          session.destroy();
          return;
        }
        created = session;
        if (runtimeFlags.testHooks) removeHooks = exposeTestHooks(session);
        setMatch({ session, options });
      })
      .catch((error: unknown) => {
        window.clearTimeout(startTimer);
        if (disposed) return;
        console.warn('Could not start the battle', error);
        setStartError(error instanceof SessionStartError ? error.message : 'The battle could not be started.');
      });

    return () => {
      disposed = true;
      window.clearTimeout(startTimer);
      removeHooks?.();
      created?.destroy();
      setMatch(null);
    };
    // onEnd is intentionally read once per match (a stable ref is passed in).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, textures, attempt]);

  const retryStart = useCallback(() => {
    setStartError(null);
    setAttempt((value) => value + 1);
  }, []);

  return { match, startError, retryStart };
}
