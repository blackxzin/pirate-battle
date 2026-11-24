import { isValidSessionSeconds, isValidSpawnSeconds } from '../game/config';
import type { EndReason } from '../game/types';
import { isRecord } from '../storage/localStore';

/** Shared REST contracts for ranking and match history (client + MSW). */

export interface MatchConfigSummary {
  readonly sessionSeconds: number;
  readonly spawnIntervalSeconds: number;
}

export interface MatchRecord {
  /** Client-generated id: the idempotency key for submissions. */
  readonly matchId: string;
  readonly playerId: string;
  readonly playerName: string;
  /** ISO-8601 timestamp of the end of the match. */
  readonly playedAt: string;
  readonly score: number;
  /** Effective (active, unpaused) duration. */
  readonly durationMs: number;
  readonly endReason: EndReason;
  readonly config: MatchConfigSummary;
}

export interface RankingEntry extends MatchRecord {
  readonly rank: number;
}

export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly meta: PageMeta;
}

export interface SubmitResult {
  readonly record: MatchRecord;
  /** false when the match already existed (idempotent replay). */
  readonly created: boolean;
}

export type ApiResponse<T> =
  | { readonly success: true; readonly data: T; readonly error: null }
  | { readonly success: false; readonly data: null; readonly error: { readonly code: string; readonly message: string } };

export const API_PATHS = {
  ranking: '/api/ranking',
  history: (playerId: string) => `/api/players/${encodeURIComponent(playerId)}/matches`,
  historyPattern: '/api/players/:playerId/matches',
  matches: '/api/matches',
} as const;

export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 50;

function isEndReason(value: unknown): value is EndReason {
  return value === 'time_up' || value === 'defeated';
}

export function isMatchConfigSummary(value: unknown): value is MatchConfigSummary {
  return isRecord(value) && isValidSessionSeconds(value.sessionSeconds) && isValidSpawnSeconds(value.spawnIntervalSeconds);
}

export function isMatchRecord(value: unknown): value is MatchRecord {
  return (
    isRecord(value) &&
    typeof value.matchId === 'string' &&
    value.matchId.length > 0 &&
    value.matchId.length <= 64 &&
    typeof value.playerId === 'string' &&
    value.playerId.length > 0 &&
    typeof value.playerName === 'string' &&
    value.playerName.length > 0 &&
    value.playerName.length <= 40 &&
    typeof value.playedAt === 'string' &&
    !Number.isNaN(Date.parse(value.playedAt)) &&
    Number.isInteger(value.score) &&
    (value.score as number) >= 0 &&
    typeof value.durationMs === 'number' &&
    value.durationMs >= 0 &&
    isEndReason(value.endReason) &&
    isMatchConfigSummary(value.config)
  );
}

function isPageMeta(value: unknown): value is PageMeta {
  return (
    isRecord(value) &&
    Number.isInteger(value.page) &&
    Number.isInteger(value.pageSize) &&
    Number.isInteger(value.totalItems) &&
    Number.isInteger(value.totalPages)
  );
}

export function isRankingEntry(value: unknown): value is RankingEntry {
  return isMatchRecord(value) && isRecord(value) && Number.isInteger(value.rank);
}

export function isPageOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is Page<T> {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isItem) && isPageMeta(value.meta);
}

export function isSubmitResult(value: unknown): value is SubmitResult {
  return isRecord(value) && isMatchRecord(value.record) && typeof value.created === 'boolean';
}

/**
 * Deterministic ranking order: score desc, then shorter effective duration
 * (faster to the same score), then earlier playedAt, then matchId.
 */
export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.durationMs !== b.durationMs) return a.durationMs - b.durationMs;
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

export function sameConfig(a: MatchConfigSummary, b: MatchConfigSummary): boolean {
  return a.sessionSeconds === b.sessionSeconds && a.spawnIntervalSeconds === b.spawnIntervalSeconds;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), meta: { page: safePage, pageSize, totalItems, totalPages } };
}
