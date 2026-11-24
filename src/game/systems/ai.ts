import type { ArenaDefinition } from '../arena';
import type { GameConfig, ShipStats } from '../config';
import { angleDelta, distance, pointInRect, segmentIntersectsRect, wrapAngle } from '../math';
import type { Ship } from '../types';
import { applySteering, type Steering } from './movement';

/** How far ahead (beyond the hull) enemies look for islands. */
const PROBE_DISTANCE = 70;
/** Angular step between the headings tried when the course is blocked, rad. */
const AVOID_STEP = 0.25;
/** Headings tried on each side, up to a half turn. */
const AVOID_STEPS = Math.ceil(Math.PI / AVOID_STEP);
/** Gap a probe keeps between the hull and the shore, px. */
const SHORE_MARGIN = 4;

/**
 * True when sailing from the ship along `angle` for `length` px would hit an
 * island (inflated by the hull) or leave the arena. A ship already pressed
 * against a shore may still sail along it or away from it.
 */
function pathBlocked(ship: Ship, arena: ArenaDefinition, angle: number, length: number): boolean {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const endX = ship.x + dirX * length;
  const endY = ship.y + dirY * length;
  const edge = ship.radius;
  if (endX < edge || endY < edge || endX > arena.width - edge || endY > arena.height - edge) return true;
  const padding = ship.radius + SHORE_MARGIN;
  return arena.islands.some((island) => {
    const rect = island.collider;
    const padded = { x: rect.x - padding, y: rect.y - padding, width: rect.width + padding * 2, height: rect.height + padding * 2 };
    if (!segmentIntersectsRect(ship.x, ship.y, endX, endY, padded)) return false;
    if (!pointInRect(ship.x, ship.y, rect, padding)) return true;
    // Inside the margin: only headings that point into the island are blocked.
    const nearestX = Math.max(rect.x, Math.min(ship.x, rect.x + rect.width));
    const nearestY = Math.max(rect.y, Math.min(ship.y, rect.y + rect.height));
    return (ship.x - nearestX) * dirX + (ship.y - nearestY) * dirY < 0;
  });
}

/** First clear heading turning from `desired` towards `side`, or null. */
function firstClearHeading(ship: Ship, arena: ArenaDefinition, desired: number, side: number, reach: number): number | null {
  for (let step = 1; step <= AVOID_STEPS; step += 1) {
    const candidate = wrapAngle(desired + side * step * AVOID_STEP);
    if (!pathBlocked(ship, arena, candidate, reach)) return candidate;
  }
  return null;
}

/**
 * Picks a heading towards a target, sailing around islands (no path finding:
 * islands are convex and sparse). When the course is blocked the ship commits
 * to one side and follows the shore on that side until it has a clear line to
 * the target, so it never stalls against an island face.
 */
export function avoidObstacles(ship: Ship, arena: ArenaDefinition, desired: number, targetDistance: number): number {
  const reach = ship.radius + PROBE_DISTANCE;
  if (!pathBlocked(ship, arena, desired, Math.max(reach, targetDistance - ship.radius))) ship.avoidSide = 0;
  if (!pathBlocked(ship, arena, desired, reach)) return desired;
  if (ship.avoidSide === 0) {
    // Prefer the side needing the smaller turn; ties follow the current heading.
    const left = firstClearHeading(ship, arena, desired, -1, reach);
    const right = firstClearHeading(ship, arena, desired, 1, reach);
    const turnLeft = left === null ? Infinity : Math.abs(angleDelta(desired, left));
    const turnRight = right === null ? Infinity : Math.abs(angleDelta(desired, right));
    const towardsHeading = angleDelta(desired, ship.angle) < 0 ? -1 : 1;
    ship.avoidSide = turnLeft < turnRight ? -1 : turnRight < turnLeft ? 1 : towardsHeading;
  }
  const heading =
    firstClearHeading(ship, arena, desired, ship.avoidSide, reach) ??
    firstClearHeading(ship, arena, desired, -ship.avoidSide, reach);
  if (heading === null) return wrapAngle(desired + Math.PI);
  return heading;
}

function steerTowards(ship: Ship, stats: ShipStats, heading: number, throttle: boolean, dt: number): Steering {
  const delta = angleDelta(ship.angle, heading);
  const maxStep = stats.turnSpeed * dt;
  // Turn exactly onto the heading when close, avoiding jitter.
  const turn = Math.abs(delta) <= maxStep ? delta / maxStep : Math.sign(delta);
  return { turn, throttle };
}

/** Chaser: full sail towards the player, ramming on contact. */
export function updateChaser(ship: Ship, player: Ship, config: GameConfig, arena: ArenaDefinition, dt: number): void {
  const desired = Math.atan2(player.y - ship.y, player.x - ship.x);
  const dist = distance(ship.x, ship.y, player.x, player.y);
  const heading = avoidObstacles(ship, arena, desired, dist);
  applySteering(ship, config.chaser, steerTowards(ship, config.chaser, heading, true, dt), dt);
}

export interface ShooterDecision {
  readonly shouldFire: boolean;
}

export function hasLineOfSight(arena: ArenaDefinition, ax: number, ay: number, bx: number, by: number): boolean {
  return !arena.islands.some((island) => segmentIntersectsRect(ax, ay, bx, by, island.collider));
}

/**
 * Shooter: approaches until `preferredDistance` (or until it can see the
 * player), keeps its bow on the player and fires when the player is within
 * range, in front of it and visible.
 */
export function updateShooter(
  ship: Ship,
  player: Ship,
  config: GameConfig,
  arena: ArenaDefinition,
  dt: number,
): ShooterDecision {
  const stats = config.shooter;
  const desired = Math.atan2(player.y - ship.y, player.x - ship.x);
  const dist = distance(ship.x, ship.y, player.x, player.y);
  const visible = hasLineOfSight(arena, ship.x, ship.y, player.x, player.y);
  // Behind an island it keeps sailing round it instead of waiting out of sight.
  const approaching = dist > stats.preferredDistance || !visible;
  const heading = approaching ? avoidObstacles(ship, arena, desired, dist) : desired;
  applySteering(ship, stats, steerTowards(ship, stats, heading, approaching, dt), dt);

  const aligned = Math.abs(angleDelta(ship.angle, desired)) <= stats.aimTolerance;
  const inRange = dist <= stats.attackRange;
  const shouldFire =
    player.alive && inRange && aligned && ship.cooldowns.enemy <= 0 && visible;
  return { shouldFire };
}
