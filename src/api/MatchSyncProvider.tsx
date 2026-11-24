import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Store } from '../session/store';
import { loadLastResult, saveRecordOutcome } from '../storage/preferences';
import type { MatchRecord } from './contracts';
import { toApiError } from './http';
import { matchesApi } from './matchesApi';
import { pendingMatches } from './pendingMatches';
import { queryKeys } from './queries';

/**
 * `rejected`: the server refused the record for good (4xx); it is not retried.
 * `unknown`: no outcome is known, e.g. after the mock data was reset.
 */
export type SubmissionStatus = 'saving' | 'pending' | 'saved' | 'rejected' | 'unknown';

export interface SubmissionState {
  readonly status: SubmissionStatus;
  readonly error: string | null;
}

interface MatchSyncValue {
  /** Persists the record in the outbox and submits it (idempotent by matchId). */
  readonly submit: (record: MatchRecord) => void;
  readonly retry: (matchId: string) => void;
  readonly retryAll: () => void;
  readonly statuses: Store<Record<string, SubmissionState>>;
}

const MatchSyncContext = createContext<MatchSyncValue | null>(null);

/**
 * Registers completed matches through a TanStack Query mutation. Records stay
 * in the persisted outbox until the server confirms them; replays after a
 * timeout are safe because the server deduplicates by matchId. Pending records
 * are flushed on start-up and when the browser comes back online.
 */
export function MatchSyncProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = useQueryClient();
  const inFlight = useRef(new Set<string>());
  const [statuses] = useState(() => new Store<Record<string, SubmissionState>>({}));
  const { mutateAsync } = useMutation({
    mutationKey: ['submit-match'],
    mutationFn: (record: MatchRecord) => matchesApi.submitMatch(record),
  });

  const send = useCallback(
    (record: MatchRecord) => {
      if (inFlight.current.has(record.matchId)) return;
      inFlight.current.add(record.matchId);
      statuses.update({ [record.matchId]: { status: 'saving', error: null } });
      mutateAsync(record)
        .then(() => {
          pendingMatches.remove(record.matchId);
          saveRecordOutcome(record.matchId, { status: 'saved' });
          statuses.update({ [record.matchId]: { status: 'saved', error: null } });
          void queryClient.invalidateQueries({ queryKey: queryKeys.rankingAll });
          void queryClient.invalidateQueries({ queryKey: queryKeys.historyAll });
        })
        .catch((error: unknown) => {
          const apiError = toApiError(error);
          if (apiError.retryable) {
            statuses.update({ [record.matchId]: { status: 'pending', error: apiError.message } });
            return;
          }
          // Permanent refusal: replaying it on every start-up would never succeed.
          console.warn('Match record rejected by the server', record.matchId, apiError.message);
          pendingMatches.remove(record.matchId);
          saveRecordOutcome(record.matchId, { status: 'rejected', error: apiError.message });
          statuses.update({ [record.matchId]: { status: 'rejected', error: apiError.message } });
        })
        .finally(() => {
          inFlight.current.delete(record.matchId);
        });
    },
    [mutateAsync, queryClient, statuses],
  );

  const submit = useCallback(
    (record: MatchRecord) => {
      pendingMatches.add(record);
      send(record);
    },
    [send],
  );

  const retry = useCallback(
    (matchId: string) => {
      const record = pendingMatches.getSnapshot().find((item) => item.matchId === matchId);
      if (record) send(record);
    },
    [send],
  );

  const retryAll = useCallback(() => pendingMatches.getSnapshot().forEach(send), [send]);

  useEffect(() => {
    retryAll();
    window.addEventListener('online', retryAll);
    return () => window.removeEventListener('online', retryAll);
  }, [retryAll]);

  const value = useMemo(() => ({ submit, retry, retryAll, statuses }), [submit, retry, retryAll, statuses]);
  return <MatchSyncContext.Provider value={value}>{children}</MatchSyncContext.Provider>;
}

export function useMatchSync(): MatchSyncValue {
  const context = useContext(MatchSyncContext);
  if (!context) throw new Error('useMatchSync must be used inside MatchSyncProvider');
  return context;
}

export function usePendingMatches(): readonly MatchRecord[] {
  return useSyncExternalStore(pendingMatches.subscribe, pendingMatches.getSnapshot);
}

/** Status of one match registration, combining live state and the outbox. */
export function useSubmission(matchId: string | null): SubmissionState | null {
  const { statuses } = useMatchSync();
  const all = useSyncExternalStore(statuses.subscribe, statuses.getSnapshot);
  const pending = usePendingMatches();
  if (!matchId) return null;
  const live = all[matchId];
  if (live) return live;
  if (pending.some((item) => item.matchId === matchId)) return { status: 'pending', error: null };
  const outcome = loadLastResult()?.matchId === matchId ? loadLastResult()?.record : undefined;
  return outcome ? { status: outcome.status, error: outcome.error ?? null } : { status: 'unknown', error: null };
}
