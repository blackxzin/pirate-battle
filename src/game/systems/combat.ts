import type { ArenaDefinition } from '../arena';
import type { BroadsideStats, WeaponStats } from '../config';
import { circlesOverlap, pointInRect } from '../math';
import type { Faction, GameEvent, Projectile, Ship, WeaponId } from '../types';

export interface ProjectileFactory {
  nextId(): number;
}

function createProjectile(
  ids: ProjectileFactory,
  faction: Faction,
  weapon: WeaponId,
  x: number,
  y: number,
  angle: number,
  stats: WeaponStats,
  radius: number,
): Projectile {
  return {
    id: ids.nextId(),
    faction,
    weapon,
    x,
    y,
    vx: Math.cos(angle) * stats.projectileSpeed,
    vy: Math.sin(angle) * stats.projectileSpeed,
    damage: stats.damage,
    radius,
    remainingDistance: stats.range,
    alive: true,
  };
}

export function tickCooldowns(ship: Ship, dt: number): void {
  const cooldowns = ship.cooldowns;
  cooldowns.front = Math.max(0, cooldowns.front - dt);
  cooldowns.left = Math.max(0, cooldowns.left - dt);
  cooldowns.right = Math.max(0, cooldowns.right - dt);
  cooldowns.enemy = Math.max(0, cooldowns.enemy - dt);
}

/** Fires a single projectile from the bow. Returns null when on cooldown. */
export function fireFront(
  ship: Ship,
  weapon: WeaponId,
  faction: Faction,
  stats: WeaponStats,
  radius: number,
  ids: ProjectileFactory,
): Projectile | null {
  if (ship.cooldowns[weapon] > 0) return null;
  ship.cooldowns[weapon] = stats.cooldown;
  const muzzle = ship.radius + radius + 2;
  return createProjectile(
    ids,
    faction,
    weapon,
    ship.x + Math.cos(ship.angle) * muzzle,
    ship.y + Math.sin(ship.angle) * muzzle,
    ship.angle,
    stats,
    radius,
  );
}

/**
 * Fires `count` parallel projectiles perpendicular to the hull. Left of the
 * heading is angle - PI/2 because the y axis points down.
 */
export function fireBroadside(
  ship: Ship,
  side: 'left' | 'right',
  stats: BroadsideStats,
  radius: number,
  ids: ProjectileFactory,
): Projectile[] {
  if (ship.cooldowns[side] > 0) return [];
  ship.cooldowns[side] = stats.cooldown;
  const direction = ship.angle + (side === 'left' ? -Math.PI / 2 : Math.PI / 2);
  const sideOffset = ship.radius * 0.7 + radius;
  const forwardX = Math.cos(ship.angle);
  const forwardY = Math.sin(ship.angle);
  const originX = ship.x + Math.cos(direction) * sideOffset;
  const originY = ship.y + Math.sin(direction) * sideOffset;
  const half = (stats.count - 1) / 2;
  return Array.from({ length: stats.count }, (_, index) => {
    const along = (index - half) * stats.spacing;
    return createProjectile(
      ids,
      'player',
      side,
      originX + forwardX * along,
      originY + forwardY * along,
      direction,
      stats,
      radius,
    );
  });
}

export interface ProjectileUpdateResult {
  readonly hits: ReadonlyArray<{ readonly projectile: Projectile; readonly target: Ship }>;
}

/**
 * Moves projectiles and resolves their end of life. Each projectile can hit at
 * most one ship: it is marked dead on the first contact.
 */
export function updateProjectiles(
  projectiles: Projectile[],
  player: Ship,
  enemies: readonly Ship[],
  arena: ArenaDefinition,
  dt: number,
  events: GameEvent[],
): ProjectileUpdateResult {
  const hits: Array<{ projectile: Projectile; target: Ship }> = [];
  for (const projectile of projectiles) {
    if (!projectile.alive) continue;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.remainingDistance -= Math.hypot(projectile.vx, projectile.vy) * dt;

    const targets = projectile.faction === 'player' ? enemies : [player];
    const target = targets.find(
      (ship) =>
        ship.alive && circlesOverlap(projectile.x, projectile.y, projectile.radius, ship.x, ship.y, ship.radius),
    );
    if (target) {
      projectile.alive = false;
      hits.push({ projectile, target });
      continue;
    }

    const cause = projectileEndCause(projectile, arena);
    if (cause) {
      projectile.alive = false;
      events.push({ type: 'projectile_end', cause, x: projectile.x, y: projectile.y });
    }
  }
  return { hits };
}

function projectileEndCause(projectile: Projectile, arena: ArenaDefinition): 'island' | 'expired' | 'out_of_bounds' | null {
  if (arena.islands.some((island) => pointInRect(projectile.x, projectile.y, island.collider))) return 'island';
  if (projectile.x < 0 || projectile.y < 0 || projectile.x > arena.width || projectile.y > arena.height) {
    return 'out_of_bounds';
  }
  if (projectile.remainingDistance <= 0) return 'expired';
  return null;
}

/** Applies damage. Returns true when the ship was destroyed by this hit. */
export function applyDamage(ship: Ship, damage: number): boolean {
  if (!ship.alive) return false;
  ship.health = Math.max(0, ship.health - damage);
  if (ship.health <= 0) {
    ship.alive = false;
    ship.speed = 0;
    return true;
  }
  return false;
}
