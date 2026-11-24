import type { ArenaDefinition } from '../arena';
import type { GameConfig, ShipStats } from '../config';
import { angleDelta, distance, pointInRect, segmentIntersectsRect, wrapAngle } from '../math';
import type { Ship } from '../types';
import { applySteering, type Steering } from './movement';

/** How far ahead (beyond the hull) enemies probe for islands. */
const PROBE_DISTANCE = 70;
/** Probe angles tried, in order, when the straight course is blocked. */
const AVOID_ANGLES = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8];

function isBlocked(arena: ArenaDefinition, x: number, y: number, padding: number): boolean {
  if (x < padding || y < padding || x > arena.width - padding || y > arena.height - padding) return true;
  return arena.islands.some((island) => pointInRect(x, y, island.collider, padding));
}

/**
 * Picks a heading towards `desired`, deflecting around islands using simple
 * look-ahead probes (no path finding: islands are convex and sparse).
 */
export function avoidObstacles(ship: Ship, arena: ArenaDefinition, desired: number): number {
  const reach = ship.radius + PROBE_DISTANCE;
  const probe = (angle: number): boolean =>
    isBlocked(arena, ship.x + Math.cos(angle) * reach, ship.y + Math.sin(angle) * reach, ship.radius * 0.6);
  if (!probe(desired)) return desired;
  for (const offset of AVOID_ANGLES) {
    const candidate = wrapAngle(desired + offset);
    if (!probe(candidate)) return candidate;
  }
  return wrapAngle(desired + Math.PI);
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
  const heading = avoidObstacles(ship, arena, desired);
  applySteering(ship, config.chaser, steerTowards(ship, config.chaser, heading, true, dt), dt);
}

export interface ShooterDecision {
  readonly shouldFire: boolean;
}

export function hasLineOfSight(arena: ArenaDefinition, ax: number, ay: number, bx: number, by: number): boolean {
  return !arena.islands.some((island) => segmentIntersectsRect(ax, ay, bx, by, island.collider));
}

/**
 * Shooter: approaches until `preferredDistance`, keeps its bow on the player
 * and fires when the player is within range, in front of it and visible.
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
  const approaching = dist > stats.preferredDistance;
  const heading = approaching ? avoidObstacles(ship, arena, desired) : desired;
  applySteering(ship, stats, steerTowards(ship, stats, heading, approaching, dt), dt);

  const aligned = Math.abs(angleDelta(ship.angle, desired)) <= stats.aimTolerance;
  const inRange = dist <= stats.attackRange;
  const shouldFire =
    player.alive && inRange && aligned && ship.cooldowns.enemy <= 0 && hasLineOfSight(arena, ship.x, ship.y, player.x, player.y);
  return { shouldFire };
}
