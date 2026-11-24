export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const TAU = Math.PI * 2;

/** Normalizes an angle to the range (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let result = angle % TAU;
  if (result <= -Math.PI) result += TAU;
  if (result > Math.PI) result -= TAU;
  return result;
}

/** Signed shortest difference from `from` to `to`. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** Rotates `current` towards `target` by at most `maxStep` radians. */
export function rotateTowards(current: number, target: number, maxStep: number): number {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(delta) * maxStep);
}

export function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distanceSq(ax, ay, bx, by));
}

export function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const radius = ar + br;
  return distanceSq(ax, ay, bx, by) < radius * radius;
}

export function pointInRect(x: number, y: number, rect: Rect, padding = 0): boolean {
  return (
    x >= rect.x - padding &&
    x <= rect.x + rect.width + padding &&
    y >= rect.y - padding &&
    y <= rect.y + rect.height + padding
  );
}

export function circleIntersectsRect(x: number, y: number, radius: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  return distanceSq(x, y, nearestX, nearestY) < radius * radius;
}

/**
 * Returns the translation that pushes a circle out of a rectangle, or null when
 * they do not overlap. Handles the case where the centre is inside the rect.
 */
export function resolveCircleRect(x: number, y: number, radius: number, rect: Rect): Vec2 | null {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const nearestX = Math.max(rect.x, Math.min(x, right));
  const nearestY = Math.max(rect.y, Math.min(y, bottom));
  const dx = x - nearestX;
  const dy = y - nearestY;
  const distSq = dx * dx + dy * dy;

  if (distSq > 0) {
    if (distSq >= radius * radius) return null;
    const dist = Math.sqrt(distSq);
    const push = radius - dist;
    return { x: (dx / dist) * push, y: (dy / dist) * push };
  }

  // Centre inside the rectangle: push out along the axis of least penetration.
  const toLeft = x - rect.x + radius;
  const toRight = right - x + radius;
  const toTop = y - rect.y + radius;
  const toBottom = bottom - y + radius;
  const min = Math.min(toLeft, toRight, toTop, toBottom);
  if (min === toLeft) return { x: -toLeft, y: 0 };
  if (min === toRight) return { x: toRight, y: 0 };
  if (min === toTop) return { x: 0, y: -toTop };
  return { x: 0, y: toBottom };
}

/** Liang–Barsky segment vs rectangle test. */
export function segmentIntersectsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rect.x, rect.x + rect.width - x1, y1 - rect.y, rect.y + rect.height - y1];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i] ?? 0;
    const qi = q[i] ?? 0;
    if (pi === 0) {
      if (qi < 0) return false;
      continue;
    }
    const t = qi / pi;
    if (pi < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}
