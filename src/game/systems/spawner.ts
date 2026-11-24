import type { ArenaDefinition } from '../arena';
import type { GameConfig } from '../config';
import { circleIntersectsRect, distanceSq } from '../math';
import type { Rng } from '../rng';
import type { Ship, ShipKind } from '../types';

export interface SpawnPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * The first two spawns are one Chaser and one Shooter so both types always
 * appear in a standard match; afterwards the configured weight decides.
 */
export function pickEnemyKind(spawnIndex: number, config: GameConfig, rng: Rng): Exclude<ShipKind, 'player'> {
  if (spawnIndex === 0) return 'chaser';
  if (spawnIndex === 1) return 'shooter';
  return rng.next() < config.spawn.chaserWeight ? 'chaser' : 'shooter';
}

export function isValidSpawnPoint(
  point: SpawnPoint,
  radius: number,
  player: Ship,
  others: readonly Ship[],
  config: GameConfig,
  arena: ArenaDefinition,
): boolean {
  const { clearance, minDistanceFromPlayer } = config.spawn;
  if (distanceSq(point.x, point.y, player.x, player.y) < minDistanceFromPlayer * minDistanceFromPlayer) return false;
  if (arena.islands.some((island) => circleIntersectsRect(point.x, point.y, radius + clearance, island.collider))) {
    return false;
  }
  return others.every((ship) => {
    if (!ship.alive) return true;
    const min = ship.radius + radius + clearance;
    return distanceSq(point.x, point.y, ship.x, ship.y) >= min * min;
  });
}

/** Samples random points until a valid one is found, or returns null. */
export function findSpawnPoint(
  radius: number,
  player: Ship,
  others: readonly Ship[],
  config: GameConfig,
  arena: ArenaDefinition,
  rng: Rng,
): SpawnPoint | null {
  const margin = Math.max(config.spawn.edgeMargin, radius);
  for (let attempt = 0; attempt < config.spawn.attempts; attempt += 1) {
    const point = { x: rng.range(margin, arena.width - margin), y: rng.range(margin, arena.height - margin) };
    if (isValidSpawnPoint(point, radius, player, others, config, arena)) return point;
  }
  return null;
}
