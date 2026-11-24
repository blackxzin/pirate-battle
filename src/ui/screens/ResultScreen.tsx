import { useState } from 'react';
import { useMatchSync, useSubmission, type SubmissionStatus } from '../../api/MatchSyncProvider';
import { loadLastResult } from '../../storage/preferences';
import { MenuButton } from '../components/Buttons';
import { Panel } from '../components/Panel';
import { endReasonLabel, formatDuration } from '../format';
import { navigate } from '../router';

type Props = {
  readonly onPlayAgain: () => void;
};

/** Result of the last completed match, persisted so it survives a refresh. */
export function ResultScreen({ onPlayAgain }: Props) {
  const [result] = useState(() => loadLastResult());
  const submission = useSubmission(result?.matchId ?? null);
  const { retry } = useMatchSync();

  if (!result) {
    return (
      <main className="screen">
        <Panel title="No battle yet" titleId="result-title">
          <p>Finish a battle to see its result here.</p>
          <MenuButton onClick={() => navigate('menu')}>Main Menu</MenuButton>
        </Panel>
      </main>
    );
  }

  const title = result.endReason === 'defeated' ? 'Ship Sunk' : 'Battle Complete';
  return (
    <main className="screen">
      <Panel title={title} titleId="result-title">
        <p className="big-score" data-testid="result-score">
          {result.score}
        </p>
        <p className="result-meta" data-testid="result-meta">
          Points · {formatDuration(result.durationMs)} · {endReasonLabel(result.endReason)}
        </p>
        <RecordStatus status={submission?.status ?? 'saved'} error={submission?.error ?? null} onRetry={() => retry(result.matchId)} />
        <MenuButton onClick={onPlayAgain}>Play Again</MenuButton>
        <MenuButton onClick={() => navigate('menu')}>Main Menu</MenuButton>
      </Panel>
    </main>
  );
}

type RecordStatusProps = {
  readonly status: SubmissionStatus;
  readonly error: string | null;
  readonly onRetry: () => void;
};

function RecordStatus({ status, error, onRetry }: RecordStatusProps) {
  if (status === 'saved') {
    return (
      <p className="notice" role="status" data-testid="record-status" data-status="saved">
        Recorded in the Captain&apos;s Log.
      </p>
    );
  }
  if (status === 'saving') {
    return (
      <p className="notice" role="status" data-testid="record-status" data-status="saving">
        Recording your battle…
      </p>
    );
  }
  if (status === 'rejected') {
    return (
      <p className="notice notice--error" role="alert" data-testid="record-status" data-status="rejected">
        This battle could not be recorded{error ? `: ${error}` : '.'}
      </p>
    );
  }
  return (
    <div className="notice notice--error" role="alert" data-testid="record-status" data-status="pending">
      <p>Not recorded yet{error ? `: ${error}` : '.'} It is kept safely and will be retried.</p>
      <button type="button" className="text-button" onClick={onRetry}>
        Retry now
      </button>
    </div>
  );
}
