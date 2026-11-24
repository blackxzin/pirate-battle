import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/http';
import { MAX_RETRIES, queryKeys, retryDelay, shouldRetry } from '../api/queries';
import { configLabel, endReasonLabel, formatClock, formatDuration, formatPlayedAt } from './format';
import { parseRoute } from './router';

describe('format', () => {
  it('formats clocks and durations as mm:ss', () => {
    expect(formatClock(125)).toBe('02:05');
    expect(formatClock(59.6)).toBe('01:00');
    expect(formatClock(-3)).toBe('00:00');
    expect(formatDuration(61_999)).toBe('01:01');
  });

  it('formats the played-at date in local time', () => {
    const iso = new Date(2026, 8, 8, 19, 36).toISOString();
    expect(formatPlayedAt(iso)).toBe('08 SEP 2026 · 19:36');
    expect(formatPlayedAt('not a date')).toBe('—');
  });

  it('labels end reasons and configurations', () => {
    expect(endReasonLabel('time_up')).toBe('Time up');
    expect(endReasonLabel('defeated')).toBe('Defeated');
    expect(configLabel({ sessionSeconds: 60, spawnIntervalSeconds: 2.5 })).toBe(
      '60 second battles · 2.5 second spawn interval',
    );
  });
});

describe('router', () => {
  it('maps known hashes and falls back to the menu', () => {
    expect(parseRoute('#/options')).toBe('options');
    expect(parseRoute('#/play')).toBe('play');
    expect(parseRoute('#/log/ranking')).toBe('ranking');
    expect(parseRoute('#/log/history')).toBe('history');
    expect(parseRoute('#/result')).toBe('result');
    expect(parseRoute('')).toBe('menu');
    expect(parseRoute('#/nope')).toBe('menu');
  });
});

describe('query policy', () => {
  it('classifies errors as retryable or permanent', () => {
    expect(new ApiError('http', 'throttled', 429).retryable).toBe(true);
    expect(new ApiError('http', 'timeout', 408).retryable).toBe(true);
    expect(new ApiError('http', 'missing', 404).retryable).toBe(false);
    expect(new ApiError('cancelled', 'gone').retryable).toBe(false);
    expect(new ApiError('invalid_response', 'odd').retryable).toBe(false);
    expect(new ApiError('timeout', 'slow').retryable).toBe(true);
  });

  it('retries transient errors only, up to the limit', () => {
    const transient = new ApiError('http', 'down', 503);
    const permanent = new ApiError('http', 'bad', 400);
    expect(shouldRetry(0, transient)).toBe(true);
    expect(shouldRetry(MAX_RETRIES, transient)).toBe(false);
    expect(shouldRetry(0, permanent)).toBe(false);
  });

  it('backs off exponentially with a cap', () => {
    expect(retryDelay(0)).toBe(400);
    expect(retryDelay(1)).toBe(800);
    expect(retryDelay(10)).toBe(4000);
  });

  it('keys the ranking by configuration so configurations never mix', () => {
    const a = queryKeys.ranking({ sessionSeconds: 60, spawnIntervalSeconds: 3 }, 1);
    const b = queryKeys.ranking({ sessionSeconds: 120, spawnIntervalSeconds: 3 }, 1);
    expect(a).not.toEqual(b);
    expect(queryKeys.history('p1', 2)).toEqual(['history', 'p1', 2]);
  });
});
