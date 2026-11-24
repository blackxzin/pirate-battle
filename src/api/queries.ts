import { QueryClient, keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MatchConfigSummary, MatchRecord, Page, RankingEntry } from './contracts';
import { toApiError } from './http';
import { matchesApi } from './matchesApi';

export const MAX_RETRIES = 2;

export const queryKeys = {
  rankingAll: ['ranking'] as const,
  historyAll: ['history'] as const,
  ranking: (config: MatchConfigSummary, page: number) =>
    ['ranking', config.sessionSeconds, config.spawnIntervalSeconds, page] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
};

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && toApiError(error).retryable;
}

export function retryDelay(attempt: number): number {
  return Math.min(4000, 400 * 2 ** attempt);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: shouldRetry, retryDelay },
    },
  });
}

/**
 * Ranking for one gameplay configuration. `refetchOnMount: 'always'` refreshes
 * the tab whenever it is shown again; previous page data stays visible while a
 * new page loads. TanStack Query cancels superseded fetches for the same key
 * (and Axios aborts them via `signal`), so late responses cannot overwrite
 * newer data.
 */
export function useRanking(config: MatchConfigSummary, page: number): UseQueryResult<Page<RankingEntry>> {
  return useQuery({
    queryKey: queryKeys.ranking(config, page),
    queryFn: ({ signal }) => matchesApi.fetchRanking(config, page, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}

export function useHistory(playerId: string, page: number): UseQueryResult<Page<MatchRecord>> {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => matchesApi.fetchHistory(playerId, page, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  });
}
