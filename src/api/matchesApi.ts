import type { AxiosInstance } from 'axios';
import {
  API_PATHS,
  DEFAULT_PAGE_SIZE,
  isMatchRecord,
  isPageOf,
  isRankingEntry,
  isSubmitResult,
  type MatchConfigSummary,
  type MatchRecord,
  type Page,
  type RankingEntry,
  type SubmitResult,
} from './contracts';
import { httpClient, toApiError, unwrap } from './http';

export interface MatchesApi {
  fetchRanking(config: MatchConfigSummary, page: number, signal?: AbortSignal): Promise<Page<RankingEntry>>;
  fetchHistory(playerId: string, page: number, signal?: AbortSignal): Promise<Page<MatchRecord>>;
  submitMatch(record: MatchRecord, signal?: AbortSignal): Promise<SubmitResult>;
}

export function createMatchesApi(client: AxiosInstance, pageSize = DEFAULT_PAGE_SIZE): MatchesApi {
  return {
    async fetchRanking(config, page, signal) {
      try {
        const response = await client.get<unknown>(API_PATHS.ranking, {
          params: { ...config, page, pageSize },
          signal,
        });
        return unwrap(response.data, (value): value is Page<RankingEntry> => isPageOf(value, isRankingEntry));
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async fetchHistory(playerId, page, signal) {
      try {
        const response = await client.get<unknown>(API_PATHS.history(playerId), { params: { page, pageSize }, signal });
        return unwrap(response.data, (value): value is Page<MatchRecord> => isPageOf(value, isMatchRecord));
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },

    async submitMatch(record, signal) {
      try {
        const response = await client.post<unknown>(API_PATHS.matches, record, { signal });
        return unwrap(response.data, isSubmitResult);
      } catch (error: unknown) {
        throw toApiError(error);
      }
    },
  };
}

export const matchesApi = createMatchesApi(httpClient);
