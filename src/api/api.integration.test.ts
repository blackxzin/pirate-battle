import { QueryClient } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockDb } from '../mocks/db';
import { handlers, resetMockNetworkState } from '../mocks/handlers';
import { setScenario } from '../mocks/scenarios';
import { STORAGE_KEYS, removeKey, writeJson } from '../storage/localStore';
import type { MatchRecord } from './contracts';
import { ApiError, createHttpClient, unwrap } from './http';
import { createMatchesApi } from './matchesApi';
import { PendingMatchStore } from './pendingMatches';
import { queryKeys, shouldRetry } from './queries';

const server = setupServer(...handlers);
const api = createMatchesApi(createHttpClient('http://localhost'));
const CONFIG = { sessionSeconds: 60, spawnIntervalSeconds: 3 } as const;

function record(overrides: Partial<MatchRecord> = {}): MatchRecord {
  return {
    matchId: `m-${Math.random().toString(36).slice(2)}`,
    playerId: 'player-1',
    playerName: 'Tester',
    playedAt: '2026-11-24T10:00:00.000Z',
    score: 5,
    durationMs: 60_000,
    endReason: 'time_up',
    config: CONFIG,
    ...overrides,
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  resetMockDb();
  resetMockNetworkState();
  removeKey(STORAGE_KEYS.pendingMatches);
  setScenario('normal');
});
afterEach(() => server.resetHandlers());

describe('ranking and history API', () => {
  it('paginates the ranking for one configuration with deterministic ties', async () => {
    const page1 = await api.fetchRanking({ sessionSeconds: 120, spawnIntervalSeconds: 3 }, 1);
    expect(page1.meta).toEqual({ page: 1, pageSize: 5, totalItems: 18, totalPages: 4 });
    expect(page1.items.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(page1.items[0]?.playerName).toBe('Captain Flint');
    const scores = page1.items.map((item) => item.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    await api.submitMatch(record({ matchId: 'a', score: 7, durationMs: 50_000 }));
    await api.submitMatch(record({ matchId: 'b', score: 7, durationMs: 40_000 }));
    const ranking = await api.fetchRanking(CONFIG, 1);
    expect(ranking.items.map((item) => item.matchId)).toEqual(['b', 'a']);
  });

  it('submits idempotently and exposes the record in both resources', async () => {
    const match = record();
    const first = await api.submitMatch(match);
    const replay = await api.submitMatch(match);
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    const history = await api.fetchHistory('player-1', 1);
    const ranking = await api.fetchRanking(CONFIG, 1);
    expect(history.items).toHaveLength(1);
    expect(ranking.items).toHaveLength(1);
  });

  it('rejects invalid records with a non-retryable 400', async () => {
    const invalid = { ...record(), score: -1 };
    const error = await api.submitMatch(invalid).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).retryable).toBe(false);
    expect(shouldRetry(0, error)).toBe(false);
  });

  it.each([
    ['server-error', 500, true],
    ['bad-request', 400, false],
    ['history-error', 503, true],
  ] as const)('scenario %s maps to HTTP %d (retryable: %s)', async (scenario, status, retryable) => {
    setScenario(scenario);
    const error = (await api.fetchHistory('player-1', 1).catch((caught: unknown) => caught)) as ApiError;
    expect(error.status).toBe(status);
    expect(error.retryable).toBe(retryable);
  });

  it('reports connection failures as retryable network errors', async () => {
    setScenario('offline');
    const error = (await api.fetchRanking(CONFIG, 1).catch((caught: unknown) => caught)) as ApiError;
    expect(error.kind).toBe('network');
    expect(error.retryable).toBe(true);
  });

  it('returns empty pages in the empty scenario', async () => {
    setScenario('empty');
    const page = await api.fetchRanking({ sessionSeconds: 120, spawnIntervalSeconds: 3 }, 1);
    expect(page.items).toHaveLength(0);
  });

  it('recovers a timed-out submission without duplicating it', async () => {
    setScenario('submit-timeout-after-save');
    const match = record();
    const error = (await api.submitMatch(match).catch((caught: unknown) => caught)) as ApiError;
    expect(error.kind).toBe('timeout');
    const retry = await api.submitMatch(match);
    expect(retry.created).toBe(false);
    expect((await api.fetchHistory('player-1', 1)).items).toHaveLength(1);
  }, 15_000);

  it('a late response for a superseded fetch does not overwrite newer data', async () => {
    setScenario('out-of-order');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = queryKeys.history('player-1', 1);
    const fetchPage = ({ signal }: { signal: AbortSignal }) => api.fetchHistory('player-1', 1, signal);

    // Request #1 is slow (odd). Start it, then record a match and refetch (#3 slow, but #2 is the POST).
    const slow = client.fetchQuery({ queryKey: key, queryFn: fetchPage }).catch(() => undefined);
    await api.submitMatch(record());
    await client.invalidateQueries({ queryKey: key });
    await client.fetchQuery({ queryKey: key, queryFn: fetchPage, staleTime: 0 });
    await slow;
    const data = client.getQueryData<Awaited<ReturnType<typeof api.fetchHistory>>>(key);
    expect(data?.items).toHaveLength(1);
  }, 15_000);
});

describe('envelope handling', () => {
  const isNumber = (value: unknown): value is number => typeof value === 'number';

  it('treats a success:false envelope as a permanent rejection', () => {
    const error = (() => {
      try {
        return unwrap({ success: false, data: null, error: { code: 'RULE', message: 'Nope.' } }, isNumber);
      } catch (caught: unknown) {
        return caught;
      }
    })() as ApiError;
    expect(error.kind).toBe('rejected');
    expect(error.message).toBe('Nope.');
    expect(error.retryable).toBe(false);
  });

  it.each([null, 'text', {}, { success: false, data: null, error: null }, { success: true, data: 'x', error: null }])(
    'reports malformed bodies as invalid responses (%j)',
    (body) => {
      expect(() => unwrap(body, isNumber)).toThrow(ApiError);
      try {
        unwrap(body, isNumber);
      } catch (caught: unknown) {
        expect((caught as ApiError).kind).toBe('invalid_response');
      }
    },
  );

  it('unwraps valid data', () => {
    expect(unwrap({ success: true, data: 3, error: null }, isNumber)).toBe(3);
  });
});

describe('pending outbox', () => {
  it('keeps the valid records when one stored entry is corrupt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const good = record();
    writeJson(STORAGE_KEYS.pendingMatches, [good, { matchId: 'broken' }]);
    expect(new PendingMatchStore().getSnapshot()).toEqual([good]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('persists records until removed and ignores duplicates', () => {
    const store = new PendingMatchStore();
    const match = record();
    store.add(match);
    store.add(match);
    expect(new PendingMatchStore().getSnapshot()).toHaveLength(1);
    store.remove(match.matchId);
    expect(new PendingMatchStore().getSnapshot()).toHaveLength(0);
  });
});
