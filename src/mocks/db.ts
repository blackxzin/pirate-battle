import {
  compareRanking,
  isMatchRecord,
  paginate,
  sameConfig,
  type MatchConfigSummary,
  type MatchRecord,
  type Page,
  type RankingEntry,
} from '../api/contracts';
import { STORAGE_KEYS, readJson, removeKey, writeJson } from '../storage/localStore';
import { FIXTURE_MATCHES } from './fixtures';

/**
 * Mock "server" database persisted in localStorage so confirmed records survive
 * refreshes. Each match is stored once, keyed by matchId; the ranking is
 * derived from the same rows, so both tabs always agree.
 */
interface MockDbState {
  readonly version: 1;
  readonly matches: readonly MatchRecord[];
}

function isMockDbState(value: unknown): value is MockDbState {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MockDbState).version === 1 &&
    Array.isArray((value as MockDbState).matches) &&
    (value as MockDbState).matches.every(isMatchRecord)
  );
}

function initialState(): MockDbState {
  return { version: 1, matches: [...FIXTURE_MATCHES] };
}

function load(): MockDbState {
  return readJson(STORAGE_KEYS.mockDb, isMockDbState) ?? initialState();
}

function save(state: MockDbState): void {
  writeJson(STORAGE_KEYS.mockDb, state);
}

export function resetMockDb(): void {
  removeKey(STORAGE_KEYS.mockDb);
}

export function findMatch(matchId: string): MatchRecord | null {
  return load().matches.find((match) => match.matchId === matchId) ?? null;
}

/** Idempotent insert: replays return the stored record with created=false. */
export function insertMatch(record: MatchRecord): { record: MatchRecord; created: boolean } {
  const state = load();
  const existing = state.matches.find((match) => match.matchId === record.matchId);
  if (existing) return { record: existing, created: false };
  save({ ...state, matches: [...state.matches, record] });
  return { record, created: true };
}

export function queryRanking(config: MatchConfigSummary, page: number, pageSize: number): Page<RankingEntry> {
  const ranked = load()
    .matches.filter((match) => sameConfig(match.config, config))
    .slice()
    .sort(compareRanking)
    .map((match, index) => ({ ...match, rank: index + 1 }));
  return paginate(ranked, page, pageSize);
}

export function queryHistory(playerId: string, page: number, pageSize: number): Page<MatchRecord> {
  const matches = load()
    .matches.filter((match) => match.playerId === playerId)
    .slice()
    .sort((a, b) => (a.playedAt < b.playedAt ? 1 : a.playedAt > b.playedAt ? -1 : 0));
  return paginate(matches, page, pageSize);
}
