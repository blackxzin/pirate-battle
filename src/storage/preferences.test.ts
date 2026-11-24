import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS, getStorage, readJson, removeKey, writeJson } from './localStore';
import {
  DEFAULT_OPTIONS,
  createId,
  isValidPlayerName,
  loadLastResult,
  loadOptions,
  loadPlayer,
  saveLastResult,
  saveOptions,
  savePlayerName,
  saveRecordOutcome,
  type LastResult,
} from './preferences';

const RESULT: LastResult = {
  matchId: 'm-1',
  score: 7,
  durationMs: 42_000,
  endReason: 'defeated',
  playedAt: '2026-11-24T10:00:00.000Z',
  config: { sessionSeconds: 120, spawnIntervalSeconds: 3 },
};

beforeEach(() => {
  Object.values(STORAGE_KEYS).forEach(removeKey);
  vi.restoreAllMocks();
});

describe('options', () => {
  it('falls back to defaults when nothing or something invalid is stored', () => {
    expect(loadOptions()).toEqual(DEFAULT_OPTIONS);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    getStorage().setItem(STORAGE_KEYS.options, JSON.stringify({ sessionSeconds: 999, spawnIntervalSeconds: 3, soundEnabled: true }));
    expect(loadOptions()).toEqual(DEFAULT_OPTIONS);
    getStorage().setItem(STORAGE_KEYS.options, '{not json');
    expect(loadOptions()).toEqual(DEFAULT_OPTIONS);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('round-trips valid options and refuses invalid ones', () => {
    const options = { sessionSeconds: 90, spawnIntervalSeconds: 1.5, soundEnabled: false };
    saveOptions(options);
    expect(loadOptions()).toEqual(options);
    expect(() => saveOptions({ ...options, spawnIntervalSeconds: 1.3 })).toThrow(/invalid options/);
    expect(loadOptions()).toEqual(options);
  });
});

describe('player profile', () => {
  it('creates a stable profile once', () => {
    const first = loadPlayer();
    expect(first.name).toBe('Captain You');
    expect(loadPlayer()).toEqual(first);
  });

  it('validates and trims the captain name', () => {
    expect(isValidPlayerName(' A ')).toBe(false);
    expect(isValidPlayerName('x'.repeat(21))).toBe(false);
    expect(isValidPlayerName(42)).toBe(false);
    const id = loadPlayer().id;
    expect(savePlayerName('  Anne Bonny ')).toEqual({ id, name: 'Anne Bonny' });
    expect(() => savePlayerName('A')).toThrow(/2 to 20/);
  });

  it('generates unique ids', () => {
    expect(createId()).not.toBe(createId());
  });
});

describe('last result', () => {
  it('round-trips a valid result and rejects tampered data', () => {
    expect(loadLastResult()).toBeNull();
    saveLastResult(RESULT);
    expect(loadLastResult()).toEqual(RESULT);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeJson(STORAGE_KEYS.lastResult, { ...RESULT, endReason: 'quit' });
    expect(loadLastResult()).toBeNull();
    writeJson(STORAGE_KEYS.lastResult, { ...RESULT, config: { sessionSeconds: 5, spawnIntervalSeconds: 3 } });
    expect(loadLastResult()).toBeNull();
  });
});

describe('record outcome', () => {
  it('is stored on the matching last result only and can be cleared', () => {
    saveLastResult(RESULT);
    saveRecordOutcome('other-match', { status: 'saved' });
    expect(loadLastResult()?.record).toBeUndefined();

    saveRecordOutcome(RESULT.matchId, { status: 'rejected', error: 'Bad request' });
    expect(loadLastResult()).toEqual({ ...RESULT, record: { status: 'rejected', error: 'Bad request' } });

    saveRecordOutcome(RESULT.matchId, null);
    expect(loadLastResult()).toEqual(RESULT);
  });

  it('rejects a tampered outcome', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeJson(STORAGE_KEYS.lastResult, { ...RESULT, record: { status: 'maybe' } });
    expect(loadLastResult()).toBeNull();
  });
});

describe('localStore', () => {
  it('reads null for missing keys and survives write failures', () => {
    expect(readJson('missing', (_value): _value is unknown => true)).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => writeJson('circular', circular)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });
});
