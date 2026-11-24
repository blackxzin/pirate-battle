/**
 * Central, typed gameplay configuration.
 *
 * Every balancing value lives here. Systems read from a frozen snapshot that is
 * created when a match starts, so changing options mid-match only affects the
 * next match. Units: pixels, seconds and radians unless stated otherwise.
 */

export interface ShipStats {
  readonly maxHealth: number;
  /** Top speed in px/s. */
  readonly maxSpeed: number;
  /** Acceleration while sailing forward, px/s². */
  readonly acceleration: number;
  /** Speed lost per second when not accelerating, px/s². */
  readonly drag: number;
  /** Rotation speed in rad/s. */
  readonly turnSpeed: number;
  /** Collision radius in px. */
  readonly radius: number;
}

export interface WeaponStats {
  readonly damage: number;
  /** Projectile speed in px/s. */
  readonly projectileSpeed: number;
  /** Maximum travel distance in px before the projectile expires. */
  readonly range: number;
  /** Minimum time between shots of this weapon, seconds. */
  readonly cooldown: number;
}

export interface BroadsideStats extends WeaponStats {
  /** Number of parallel projectiles per broadside. */
  readonly count: number;
  /** Distance between parallel projectiles, px. */
  readonly spacing: number;
}

export interface SpawnConfig {
  /** Delay before the first spawn, seconds. */
  readonly initialDelay: number;
  /** Probability [0..1] that a spawn is a Chaser (the rest are Shooters). */
  readonly chaserWeight: number;
  /** Minimum distance between a spawn point and the player, px. */
  readonly minDistanceFromPlayer: number;
  /** Extra clearance from islands and other ships, px. */
  readonly clearance: number;
  /** Distance from the arena edge, px. */
  readonly edgeMargin: number;
  /** Maximum simultaneous enemies. */
  readonly maxEnemies: number;
  /** Random positions tried per spawn before retrying later. */
  readonly attempts: number;
  /** Delay before retrying when no valid point was found, seconds. */
  readonly retryDelay: number;
}

export interface GameConfig {
  readonly sessionSeconds: number;
  readonly spawnIntervalSeconds: number;
  readonly spawn: SpawnConfig;
  readonly projectileRadius: number;
  readonly player: ShipStats & {
    readonly frontCannon: WeaponStats;
    readonly broadside: BroadsideStats;
  };
  readonly chaser: ShipStats & {
    /** Damage dealt to the player when a Chaser rams it. */
    readonly contactDamage: number;
  };
  readonly shooter: ShipStats & {
    readonly cannon: WeaponStats;
    /** Distance at which the Shooter opens fire, px. */
    readonly attackRange: number;
    /** Distance the Shooter tries to keep from the player, px. */
    readonly preferredDistance: number;
    /** Max angle between bow and player to fire, rad. */
    readonly aimTolerance: number;
  };
}

export interface MatchOptions {
  readonly sessionSeconds: number;
  readonly spawnIntervalSeconds: number;
}

/** Limits exposed in the Options screen. Documented in README.md. */
export const SESSION_SECONDS_LIMITS = { min: 60, max: 180, step: 10, default: 120 } as const;
export const SPAWN_SECONDS_LIMITS = { min: 1, max: 10, step: 0.5, default: 3 } as const;

export const BASE_CONFIG: Omit<GameConfig, 'sessionSeconds' | 'spawnIntervalSeconds'> = {
  projectileRadius: 6,
  spawn: {
    initialDelay: 1,
    chaserWeight: 0.5,
    minDistanceFromPlayer: 420,
    clearance: 24,
    edgeMargin: 48,
    maxEnemies: 12,
    attempts: 40,
    retryDelay: 0.25,
  },
  player: {
    maxHealth: 100,
    maxSpeed: 170,
    acceleration: 220,
    drag: 140,
    turnSpeed: 2.6,
    radius: 26,
    frontCannon: { damage: 25, projectileSpeed: 520, range: 520, cooldown: 0.35 },
    broadside: { damage: 20, projectileSpeed: 460, range: 380, cooldown: 1.2, count: 3, spacing: 22 },
  },
  chaser: {
    maxHealth: 40,
    maxSpeed: 125,
    acceleration: 160,
    drag: 120,
    turnSpeed: 2.0,
    radius: 24,
    contactDamage: 20,
  },
  shooter: {
    maxHealth: 70,
    maxSpeed: 95,
    acceleration: 120,
    drag: 120,
    turnSpeed: 1.6,
    radius: 26,
    cannon: { damage: 10, projectileSpeed: 360, range: 430, cooldown: 1.8 },
    attackRange: 400,
    preferredDistance: 260,
    aimTolerance: 0.22,
  },
};

function clampToStep(value: number, limits: { min: number; max: number; step: number }): number {
  const clamped = Math.min(limits.max, Math.max(limits.min, value));
  const steps = Math.round((clamped - limits.min) / limits.step);
  return Number((limits.min + steps * limits.step).toFixed(3));
}

/** True when `value` is a finite number inside the limits and on a step. */
export function isWithinLimits(value: unknown, limits: { min: number; max: number; step: number }): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (value < limits.min || value > limits.max) return false;
  const steps = (value - limits.min) / limits.step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

export function isValidSessionSeconds(value: unknown): value is number {
  return isWithinLimits(value, SESSION_SECONDS_LIMITS);
}

export function isValidSpawnSeconds(value: unknown): value is number {
  return isWithinLimits(value, SPAWN_SECONDS_LIMITS);
}

export function normalizeMatchOptions(options: MatchOptions): MatchOptions {
  return {
    sessionSeconds: clampToStep(options.sessionSeconds, SESSION_SECONDS_LIMITS),
    spawnIntervalSeconds: clampToStep(options.spawnIntervalSeconds, SPAWN_SECONDS_LIMITS),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach((child) => deepFreeze(child));
    Object.freeze(value);
  }
  return value;
}

/** Creates the immutable configuration snapshot used by one match. */
export function createGameConfig(
  options: MatchOptions,
  overrides: Partial<Omit<GameConfig, 'sessionSeconds' | 'spawnIntervalSeconds'>> = {},
): GameConfig {
  const normalized = normalizeMatchOptions(options);
  const config: GameConfig = structuredClone({
    ...BASE_CONFIG,
    ...overrides,
    sessionSeconds: normalized.sessionSeconds,
    spawnIntervalSeconds: normalized.spawnIntervalSeconds,
  });
  return deepFreeze(config);
}
