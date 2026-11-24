import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { HudState } from '../../../session/gameSession';
import type { Store } from '../../../session/store';
import { RoundButton } from '../../components/Buttons';
import { formatClock } from '../../format';
import { assetUrl } from '../../../assetUrl';

type Props = {
  readonly hud: Store<HudState>;
  readonly onPause: () => void;
};

const LOW_TIME_SECONDS = 10;

function healthFill(ratio: number): string {
  if (ratio > 0.6) return 'green';
  if (ratio > 0.3) return 'amber';
  return 'red';
}

/**
 * React HUD. Subscribes to the session store, which only changes when a
 * displayed value changes (at most a few times per second).
 */
export function Hud({ hud, onPause }: Props) {
  const state = useSyncExternalStore(hud.subscribe, hud.getSnapshot);
  const ratio = state.maxHealth > 0 ? state.health / state.maxHealth : 0;
  const isLowTime = state.secondsLeft <= LOW_TIME_SECONDS;

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="health-meter" data-testid="hud-health">
          <img className="health-meter__icon" src={assetUrl('ui/hud/icon_heart.png')} alt="" width={36} height={30} />
          <div className="health-meter__bar" role="meter" aria-label="Ship health" aria-valuemin={0} aria-valuemax={state.maxHealth} aria-valuenow={state.health}>
            <div className="health-meter__fill" style={{ width: `${196 * ratio}px` }}>
              <img src={assetUrl(`ui/hud/health_fill_${healthFill(ratio)}.png`)} alt="" width={256} height={48} />
            </div>
            <span className="health-meter__label">
              {state.health} / {state.maxHealth}
            </span>
          </div>
        </div>
        <div className="hud__right">
          <div className="counter" data-testid="hud-score">
            <img src={assetUrl('ui/hud/icon_score.png')} alt="" width={26} height={26} />
            <span className="visually-hidden">Score</span>
            <span>{state.score}</span>
          </div>
          <div className="counter" data-testid="hud-time" data-warning={isLowTime}>
            <img src={assetUrl('ui/hud/icon_time.png')} alt="" width={26} height={26} />
            <span className="visually-hidden">Time left</span>
            <span>{formatClock(state.secondsLeft)}</span>
          </div>
          <RoundButton icon="pause" label="Pause" onClick={onPause} disabled={state.phase !== 'running'} />
        </div>
      </div>
      <BattleAnnouncer state={state} />
    </div>
  );
}

/**
 * Screen-reader announcements for meaningful changes only (score, low health,
 * time warnings, pause, end), never per frame.
 */
function BattleAnnouncer({ state }: { readonly state: HudState }) {
  const [message, setMessage] = useState('Battle started.');
  const previous = useRef(state);

  useEffect(() => {
    const before = previous.current;
    previous.current = state;
    if (state.phase === 'ended' && before.phase !== 'ended') {
      setMessage(state.endReason === 'defeated' ? `Your ship sank. Final score ${state.score}.` : `Time up! Final score ${state.score}.`);
    } else if (state.phase === 'paused' && before.phase !== 'paused') {
      setMessage('Game paused.');
    } else if (state.phase === 'running' && before.phase === 'paused') {
      setMessage('Game resumed.');
    } else if (state.score !== before.score) {
      setMessage(`Enemy sunk. Score ${state.score}.`);
    } else if (state.health / state.maxHealth <= 0.3 && before.health / before.maxHealth > 0.3) {
      setMessage(`Warning: health low, ${state.health} left.`);
    } else if ([30, 10].includes(state.secondsLeft) && before.secondsLeft !== state.secondsLeft) {
      setMessage(`${state.secondsLeft} seconds left.`);
    }
  }, [state]);

  return (
    <>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="battle-announcer">
        {message}
      </p>
      <dl className="visually-hidden" aria-label="Battle status">
        <dt>Score</dt>
        <dd data-testid="status-score">{state.score}</dd>
        <dt>Time left</dt>
        <dd>{formatClock(state.secondsLeft)}</dd>
        <dt>Health</dt>
        <dd>
          {state.health} of {state.maxHealth}
        </dd>
        <dt>State</dt>
        <dd data-testid="status-phase">{state.phase}</dd>
      </dl>
    </>
  );
}
