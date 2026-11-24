import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMatchSync } from '../../../api/MatchSyncProvider';
import type { MatchRecord } from '../../../api/contracts';
import { runtimeFlags } from '../../../runtimeFlags';
import type { HudState, MatchOutcome } from '../../../session/gameSession';
import type { Store } from '../../../session/store';
import { createId, loadPlayer, saveLastResult } from '../../../storage/preferences';
import { MenuButton } from '../../components/Buttons';
import { Panel } from '../../components/Panel';
import { navigate } from '../../router';
import { Hud } from './Hud';
import { PauseDialog } from './PauseDialog';
import { TouchControls } from './TouchControls';
import { useGameSession, useGameTextures, type StartedMatch } from './useGameSession';

/** Time the final explosion stays on screen before the result screen. */
const RESULT_DELAY_MS = 1200;

const IDLE_HUD: HudState = {
  phase: 'running',
  pauseReason: null,
  health: 0,
  maxHealth: 1,
  score: 0,
  secondsLeft: 0,
  endReason: null,
};
const idleStore = { subscribe: () => () => undefined, getSnapshot: () => IDLE_HUD };

function useHud(store: Store<HudState> | null): HudState {
  const source = store ?? idleStore;
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}

export function GameScreen() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const { state: load, retry } = useGameTextures();
  const { submit } = useMatchSync();
  const resultTimer = useRef<number | null>(null);

  const handleEnd = useCallback(
    (outcome: MatchOutcome, options: StartedMatch['options']) => {
      const player = loadPlayer();
      const record: MatchRecord = {
        matchId: createId(),
        playerId: player.id,
        playerName: player.name,
        playedAt: new Date().toISOString(),
        score: outcome.score,
        durationMs: outcome.durationMs,
        endReason: outcome.endReason,
        config: options,
      };
      saveLastResult({
        matchId: record.matchId,
        score: record.score,
        durationMs: record.durationMs,
        endReason: record.endReason,
        playedAt: record.playedAt,
        config: options,
        // Profiling runs change the rules (an unsinkable player), so they never reach the ranking.
        ...(runtimeFlags.profiling ? { record: { status: 'rejected', error: 'profiling runs are not recorded' } as const } : {}),
      });
      if (!runtimeFlags.profiling) submit(record);
      resultTimer.current = window.setTimeout(() => navigate('result', { replace: true }), RESULT_DELAY_MS);
    },
    [submit],
  );

  useEffect(
    () => () => {
      if (resultTimer.current !== null) window.clearTimeout(resultTimer.current);
    },
    [],
  );

  const { match, startError, retryStart } = useGameSession(host, load.status === 'ready' ? load.textures : null, handleEnd);
  const hud = useHud(match?.session.hud ?? null);

  return (
    <main className="game" aria-label="Battle">
      <h1 className="visually-hidden">Pirate Battle — battle in progress</h1>
      <div className="game__stage" ref={setHost} />
      {match && <Hud hud={match.session.hud} onPause={() => match.session.pause('manual')} />}
      {match && hud.phase === 'running' && <TouchControls input={match.session.input} />}
      {load.status === 'loading' && <LoadingOverlay progress={load.progress} />}
      {load.status === 'error' && <LoadError title="Assets failed to load" message={load.message} onRetry={retry} />}
      {startError && <LoadError title="Battle could not start" message={startError} onRetry={retryStart} />}
      {match && hud.phase === 'paused' && (
        <PauseDialog
          reason={hud.pauseReason}
          onResume={() => match.session.resume()}
          onMainMenu={() => navigate('menu')}
        />
      )}
      <div className="rotate-hint" role="note">
        Rotate your device to landscape to play.
      </div>
    </main>
  );
}

function LoadingOverlay({ progress }: { readonly progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="overlay">
      <div className="panel__inner" role="status" aria-live="polite">
        <p className="panel__title">Loading the fleet…</p>
        <div className="loading-bar" role="progressbar" aria-label="Loading assets" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="loading-bar__fill" style={{ transform: `scaleX(${progress})` }} />
        </div>
        <p>{percent}%</p>
      </div>
    </div>
  );
}

type LoadErrorProps = {
  readonly title: string;
  readonly message: string;
  readonly onRetry: () => void;
};

function LoadError({ title, message, onRetry }: LoadErrorProps) {
  return (
    <div className="overlay">
      <Panel title={title} titleId="load-error-title">
        <p className="notice notice--error" role="alert">
          {message}
        </p>
        <MenuButton onClick={onRetry}>Retry</MenuButton>
        <MenuButton onClick={() => navigate('menu')}>Main Menu</MenuButton>
      </Panel>
    </div>
  );
}
