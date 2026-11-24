export type ShipKind = 'player' | 'chaser' | 'shooter';
export type Faction = 'player' | 'enemy';
export type WeaponId = 'front' | 'left' | 'right' | 'enemy';
export type EndReason = 'time_up' | 'defeated';
export type MatchStatus = 'running' | 'ended';

/**
 * Mutable entity records. They are owned exclusively by the simulation; the
 * renderer and UI only read them (or receive immutable snapshots).
 */
export interface Ship {
  readonly id: number;
  readonly kind: ShipKind;
  x: number;
  y: number;
  /** Heading in radians. 0 = facing +x, positive = clockwise (y points down). */
  angle: number;
  speed: number;
  health: number;
  readonly maxHealth: number;
  readonly radius: number;
  alive: boolean;
  /** Remaining cooldown per weapon, seconds. */
  cooldowns: Record<WeaponId, number>;
  /** True when the last movement step was blocked by an island or the arena edge. */
  blocked: boolean;
}

export interface Projectile {
  readonly id: number;
  /** Ship that fired it: a sunk enemy's shots are removed with it. */
  readonly ownerId: number;
  readonly faction: Faction;
  readonly weapon: WeaponId;
  x: number;
  y: number;
  readonly vx: number;
  readonly vy: number;
  readonly damage: number;
  readonly radius: number;
  remainingDistance: number;
  alive: boolean;
}

export interface InputState {
  readonly forward: boolean;
  readonly turnLeft: boolean;
  readonly turnRight: boolean;
  readonly fireFront: boolean;
  readonly fireLeft: boolean;
  readonly fireRight: boolean;
}

export const EMPTY_INPUT: InputState = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
});

export type ProjectileEndCause = 'island' | 'expired' | 'out_of_bounds';

export type GameEvent =
  | { readonly type: 'fire'; readonly shipId: number; readonly weapon: WeaponId; readonly x: number; readonly y: number; readonly angle: number }
  | { readonly type: 'hit'; readonly targetId: number; readonly faction: Faction; readonly x: number; readonly y: number; readonly damage: number }
  | { readonly type: 'projectile_end'; readonly cause: ProjectileEndCause; readonly x: number; readonly y: number }
  | { readonly type: 'spawn'; readonly shipId: number; readonly kind: ShipKind; readonly x: number; readonly y: number }
  | { readonly type: 'ram'; readonly shipId: number; readonly x: number; readonly y: number; readonly damage: number }
  | {
      readonly type: 'destroyed';
      readonly shipId: number;
      readonly kind: ShipKind;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      readonly byPlayer: boolean;
    }
  | { readonly type: 'score'; readonly score: number }
  | { readonly type: 'ended'; readonly reason: EndReason; readonly score: number; readonly elapsed: number };

export interface ShipSnapshot {
  readonly id: number;
  readonly kind: ShipKind;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly speed: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly cooldowns: Readonly<Record<WeaponId, number>>;
}

export interface WorldSnapshot {
  readonly status: MatchStatus;
  readonly endReason: EndReason | null;
  readonly score: number;
  readonly elapsed: number;
  readonly timeLeft: number;
  readonly player: ShipSnapshot;
  readonly enemies: readonly ShipSnapshot[];
  readonly projectiles: number;
  readonly spawned: { readonly chaser: number; readonly shooter: number };
}
