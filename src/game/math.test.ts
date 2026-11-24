import { describe, expect, it } from 'vitest';
import {
  angleDelta,
  circleIntersectsRect,
  circlesOverlap,
  distance,
  pointInRect,
  resolveCircleRect,
  rotateTowards,
  segmentIntersectsRect,
  wrapAngle,
} from './math';
import { createRng, randomSeed } from './rng';

const RECT = { x: 100, y: 100, width: 100, height: 50 };

describe('angles', () => {
  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });

  it('measures the shortest signed difference', () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(angleDelta(0.5, 0.2)).toBeCloseTo(-0.3);
  });

  it('rotates by at most the step and snaps when close', () => {
    expect(rotateTowards(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(rotateTowards(0, -1, 0.25)).toBeCloseTo(-0.25);
    expect(rotateTowards(0, 0.1, 0.25)).toBeCloseTo(0.1);
  });
});

describe('shapes', () => {
  it('computes distances and circle overlap (touching is not overlapping)', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
    expect(circlesOverlap(0, 0, 2, 3, 0, 2)).toBe(true);
    expect(circlesOverlap(0, 0, 2, 4, 0, 2)).toBe(false);
  });

  it('tests points and circles against rectangles', () => {
    expect(pointInRect(100, 100, RECT)).toBe(true);
    expect(pointInRect(95, 100, RECT)).toBe(false);
    expect(pointInRect(95, 100, RECT, 5)).toBe(true);
    expect(circleIntersectsRect(90, 120, 11, RECT)).toBe(true);
    expect(circleIntersectsRect(90, 120, 10, RECT)).toBe(false);
  });
});

describe('resolveCircleRect', () => {
  it('returns null when there is no overlap', () => {
    expect(resolveCircleRect(80, 120, 10, RECT)).toBeNull();
  });

  it('pushes an overlapping circle out along the contact normal', () => {
    const push = resolveCircleRect(95, 120, 10, RECT);
    expect(push?.x).toBeCloseTo(-5);
    expect(push?.y).toBeCloseTo(0);
  });

  it.each([
    [102, 125, { x: -12, y: 0 }],
    [198, 125, { x: 12, y: 0 }],
    [150, 101, { x: 0, y: -11 }],
    [150, 149, { x: 0, y: 11 }],
  ])('ejects a centre inside the rect (%d, %d) along the shortest axis', (x, y, expected) => {
    expect(resolveCircleRect(x, y, 10, RECT)).toEqual(expected);
  });
});

describe('segmentIntersectsRect (line of sight)', () => {
  it('detects segments crossing, inside and missing the rect', () => {
    expect(segmentIntersectsRect(50, 125, 250, 125, RECT)).toBe(true);
    expect(segmentIntersectsRect(120, 110, 130, 120, RECT)).toBe(true);
    expect(segmentIntersectsRect(50, 50, 250, 60, RECT)).toBe(false);
    expect(segmentIntersectsRect(50, 90, 50, 200, RECT)).toBe(false);
    expect(segmentIntersectsRect(150, 50, 150, 300, RECT)).toBe(true);
  });
});

describe('rng', () => {
  it('is deterministic per seed and stays in range', () => {
    const a = createRng(42);
    const b = createRng(42);
    const values = Array.from({ length: 50 }, () => a.next());
    expect(values).toEqual(Array.from({ length: 50 }, () => b.next()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
    const ranged = createRng(7).range(10, 20);
    expect(ranged).toBeGreaterThanOrEqual(10);
    expect(ranged).toBeLessThan(20);
  });

  it('creates non-negative integer seeds', () => {
    const seed = randomSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});
