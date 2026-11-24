import type { ArenaDefinition } from '../arena';
import type { ShipStats } from '../config';
import { resolveCircleRect } from '../math';
import type { Ship } from '../types';

export interface Steering {
  /** -1 = turn left, 1 = turn right, 0 = keep heading. */
  readonly turn: number;
  readonly throttle: boolean;
}

/** Applies rotation, acceleration and drag. Speed is always along the heading. */
export function applySteering(ship: Ship, stats: ShipStats, steering: Steering, dt: number): void {
  ship.angle += steering.turn * stats.turnSpeed * dt;
  if (steering.throttle) {
    ship.speed = Math.min(stats.maxSpeed, ship.speed + stats.acceleration * dt);
  } else {
    ship.speed = Math.max(0, ship.speed - stats.drag * dt);
  }
}

/** Pushes the ship out of islands and keeps it inside the arena. */
export function resolveStaticCollisions(ship: Ship, arena: ArenaDefinition): boolean {
  let blocked = false;
  for (const island of arena.islands) {
    const push = resolveCircleRect(ship.x, ship.y, ship.radius, island.collider);
    if (push) {
      ship.x += push.x;
      ship.y += push.y;
      blocked = true;
    }
  }
  const minX = ship.radius;
  const minY = ship.radius;
  const maxX = arena.width - ship.radius;
  const maxY = arena.height - ship.radius;
  if (ship.x < minX || ship.x > maxX || ship.y < minY || ship.y > maxY) {
    ship.x = Math.min(maxX, Math.max(minX, ship.x));
    ship.y = Math.min(maxY, Math.max(minY, ship.y));
    blocked = true;
  }
  return blocked;
}

/** Integrates position along the heading and resolves collisions. */
export function moveShip(ship: Ship, arena: ArenaDefinition, dt: number): void {
  ship.x += Math.cos(ship.angle) * ship.speed * dt;
  ship.y += Math.sin(ship.angle) * ship.speed * dt;
  ship.blocked = resolveStaticCollisions(ship, arena);
  if (ship.blocked) {
    // Scraping against the shore bleeds speed so ships do not grind forever.
    ship.speed *= 0.6;
  }
}

/** Pushes overlapping ships apart (equal mass), then re-resolves the shore. */
export function separateShips(ships: readonly Ship[], arena: ArenaDefinition): void {
  for (let i = 0; i < ships.length; i += 1) {
    const a = ships[i];
    if (!a?.alive) continue;
    for (let j = i + 1; j < ships.length; j += 1) {
      const b = ships[j];
      if (!b?.alive) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.radius + b.radius;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;
      const dist = Math.sqrt(distSq) || 0.0001;
      const overlap = (minDist - dist) / 2;
      const nx = dist > 0.0001 ? dx / dist : 1;
      const ny = dist > 0.0001 ? dy / dist : 0;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      resolveStaticCollisions(a, arena);
      resolveStaticCollisions(b, arena);
    }
  }
}
