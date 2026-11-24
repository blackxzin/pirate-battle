import {
  SESSION_SECONDS_LIMITS,
  SPAWN_SECONDS_LIMITS,
  isValidSessionSeconds,
  isValidSpawnSeconds,
  type MatchOptions,
} from '../game/config';
import type { EndReason } from '../game/types';
import { STORAGE_KEYS, isRecord, readJson, writeJson } from './localStore';

export interface PlayerOptions extends MatchOptions {
  readonly soundEnabled: boolean;
}

export interface PlayerProfile {
  readonly id: string;
  readonly name: string;
}

export interface LastResult {
  readonly matchId: string;
  readonly score: number;
  readonly durationMs: number;
  readonly endReason: EndReason;
  readonly playedAt: string;
  readonly config: MatchOptions;
}

export const DEFAULT_OPTIONS: PlayerOptions = {
  sessionSeconds: SESSION_SECONDS_LIMITS.default,
  spawnIntervalSeconds: SPAWN_SECONDS_LIMITS.default,
  soundEnabled: true,
};

export const PLAYER_NAME_MAX = 20;

function isPlayerOptions(value: unknown): value is PlayerOptions {
  return (
    isRecord(value) &&
    isValidSessionSeconds(value.sessionSeconds) &&
    isValidSpawnSeconds(value.spawnIntervalSeconds) &&
    typeof value.soundEnabled === 'boolean'
  );
}

export function isValidPlayerName(name: unknown): name is string {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= PLAYER_NAME_MAX;
}

function isPlayerProfile(value: unknown): value is PlayerProfile {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0 && isValidPlayerName(value.name);
}

function isEndReason(value: unknown): value is EndReason {
  return value === 'time_up' || value === 'defeated';
}

function isLastResult(value: unknown): value is LastResult {
  return (
    isRecord(value) &&
    typeof value.matchId === 'string' &&
    typeof value.score === 'number' &&
    typeof value.durationMs === 'number' &&
    isEndReason(value.endReason) &&
    typeof value.playedAt === 'string' &&
    isRecord(value.config) &&
    isValidSessionSeconds(value.config.sessionSeconds) &&
    isValidSpawnSeconds(value.config.spawnIntervalSeconds)
  );
}

export function loadOptions(): PlayerOptions {
  return readJson(STORAGE_KEYS.options, isPlayerOptions) ?? DEFAULT_OPTIONS;
}

export function saveOptions(options: PlayerOptions): void {
  if (!isPlayerOptions(options)) throw new Error('Refusing to save invalid options.');
  writeJson(STORAGE_KEYS.options, options);
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadPlayer(): PlayerProfile {
  const existing = readJson(STORAGE_KEYS.player, isPlayerProfile);
  if (existing) return existing;
  const created: PlayerProfile = { id: createId(), name: 'Captain You' };
  writeJson(STORAGE_KEYS.player, created);
  return created;
}

export function savePlayerName(name: string): PlayerProfile {
  if (!isValidPlayerName(name)) throw new Error('Captain name must have 2 to 20 characters.');
  const next: PlayerProfile = { ...loadPlayer(), name: name.trim() };
  writeJson(STORAGE_KEYS.player, next);
  return next;
}

export function loadLastResult(): LastResult | null {
  return readJson(STORAGE_KEYS.lastResult, isLastResult);
}

export function saveLastResult(result: LastResult): void {
  writeJson(STORAGE_KEYS.lastResult, result);
}
