import { useId, useState } from 'react';
import { sound } from '../../audio/sound';
import { SESSION_SECONDS_LIMITS, SPAWN_SECONDS_LIMITS } from '../../game/config';
import {
  PLAYER_NAME_MAX,
  isValidPlayerName,
  loadOptions,
  loadPlayer,
  saveOptions,
  savePlayerName,
  type PlayerOptions,
} from '../../storage/preferences';
import { RoundButton } from '../components/Buttons';

type Limits = { readonly min: number; readonly max: number; readonly step: number };

export function validateNumber(raw: string, limits: Limits, label: string): string | null {
  if (raw.trim() === '') return `${label} is required.`;
  // Plain decimals only: Number() alone would also accept "0x3C" or "1e2".
  if (!/^\s*\d+(\.\d+)?\s*$/.test(raw)) return `${label} must be a number.`;
  const value = Number(raw);
  if (value < limits.min || value > limits.max) return `${label} must be between ${limits.min} and ${limits.max} seconds.`;
  const steps = (value - limits.min) / limits.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-6) return `${label} must use steps of ${limits.step} seconds.`;
  return null;
}

type StepperProps = {
  readonly label: string;
  readonly hint: string;
  readonly limits: Limits;
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (value: string) => void;
};

function Stepper({ label, hint, limits, value, error, onChange }: StepperProps) {
  const id = useId();
  const numeric = Number(value);
  const base = Number.isFinite(numeric) ? numeric : limits.min;
  const stepBy = (direction: 1 | -1) => {
    const next = Math.min(limits.max, Math.max(limits.min, Math.round((base + direction * limits.step) * 100) / 100));
    onChange(String(next));
  };
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper">
        <RoundButton icon="minus" label={`Decrease ${label.toLowerCase()}`} onClick={() => stepBy(-1)} disabled={base <= limits.min} />
        <input
          id={id}
          inputMode="decimal"
          value={value}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          onChange={(event) => onChange(event.target.value)}
        />
        <RoundButton icon="plus" label={`Increase ${label.toLowerCase()}`} onClick={() => stepBy(1)} disabled={base >= limits.max} />
      </div>
      <p className="field__hint" id={`${id}-hint`}>
        {hint}
      </p>
      {error && (
        <p className="field__error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type Props = {
  /** Shown during a match: changes apply to the next match. */
  readonly inMatch?: boolean;
};

/**
 * Options are validated on every change and persisted as soon as they are
 * valid, so they survive a refresh. Invalid drafts are never saved.
 */
export function OptionsForm({ inMatch = false }: Props) {
  const [initial] = useState(() => ({ options: loadOptions(), player: loadPlayer() }));
  const [sessionDraft, setSessionDraft] = useState(String(initial.options.sessionSeconds));
  const [spawnDraft, setSpawnDraft] = useState(String(initial.options.spawnIntervalSeconds));
  const [nameDraft, setNameDraft] = useState(initial.player.name);
  const [soundEnabled, setSoundEnabled] = useState(initial.options.soundEnabled);
  const [status, setStatus] = useState('');
  const nameId = useId();

  const sessionError = validateNumber(sessionDraft, SESSION_SECONDS_LIMITS, 'Game session time');
  const spawnError = validateNumber(spawnDraft, SPAWN_SECONDS_LIMITS, 'Enemy spawn time');
  const nameError = isValidPlayerName(nameDraft) ? null : `Captain name must have 2 to ${PLAYER_NAME_MAX} characters.`;

  const persist = (next: { session: string; spawn: string; sound: boolean }) => {
    const sessionInvalid = validateNumber(next.session, SESSION_SECONDS_LIMITS, 'Game session time');
    const spawnInvalid = validateNumber(next.spawn, SPAWN_SECONDS_LIMITS, 'Enemy spawn time');
    if (sessionInvalid || spawnInvalid) {
      setStatus('');
      return;
    }
    const options: PlayerOptions = {
      sessionSeconds: Number(next.session),
      spawnIntervalSeconds: Number(next.spawn),
      soundEnabled: next.sound,
    };
    saveOptions(options);
    sound.setEnabled(options.soundEnabled);
    setStatus(inMatch ? 'Saved. Changes apply to your next battle.' : 'Saved.');
  };

  return (
    <form className="panel__inner" noValidate onSubmit={(event) => event.preventDefault()}>
      <Stepper
        label="Game session time"
        hint={`${SESSION_SECONDS_LIMITS.min}–${SESSION_SECONDS_LIMITS.max} s, steps of ${SESSION_SECONDS_LIMITS.step} s`}
        limits={SESSION_SECONDS_LIMITS}
        value={sessionDraft}
        error={sessionError}
        onChange={(value) => {
          setSessionDraft(value);
          persist({ session: value, spawn: spawnDraft, sound: soundEnabled });
        }}
      />
      <Stepper
        label="Enemy spawn time"
        hint={`${SPAWN_SECONDS_LIMITS.min}–${SPAWN_SECONDS_LIMITS.max} s, steps of ${SPAWN_SECONDS_LIMITS.step} s`}
        limits={SPAWN_SECONDS_LIMITS}
        value={spawnDraft}
        error={spawnError}
        onChange={(value) => {
          setSpawnDraft(value);
          persist({ session: sessionDraft, spawn: value, sound: soundEnabled });
        }}
      />
      {!inMatch && (
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Captain name
          </label>
          <input
            id={nameId}
            className="text-input"
            value={nameDraft}
            maxLength={PLAYER_NAME_MAX + 5}
            aria-invalid={nameError ? 'true' : 'false'}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            onChange={(event) => {
              const value = event.target.value;
              setNameDraft(value);
              if (isValidPlayerName(value)) {
                savePlayerName(value);
                setStatus('Saved.');
              }
            }}
          />
          {nameError && (
            <p className="field__error" id={`${nameId}-error`} role="alert">
              {nameError}
            </p>
          )}
        </div>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={soundEnabled}
          onChange={(event) => {
            setSoundEnabled(event.target.checked);
            persist({ session: sessionDraft, spawn: spawnDraft, sound: event.target.checked });
          }}
        />
        Sound effects
      </label>
      <p className="save-status" role="status">
        {status}
      </p>
    </form>
  );
}
