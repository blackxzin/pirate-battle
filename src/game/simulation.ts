import { DEFAULT_ARENA, type ArenaDefinition } from './arena';
import type { GameConfig, ShipStats } from './config';
import { circlesOverlap } from './math';
import { createRng, type Rng } from './rng';
import { updateChaser, updateShooter } from './systems/ai';
import { applyDamage, fireBroadside, fireFront, tickCooldowns, updateProjectiles } from './systems/combat';
import { applySteering, moveShip, resolveStaticCollisions, separateShips } from './systems/movement';
import { findSpawnPoint, pickEnemyKind } from './systems/spawner';
import type {
  EndReason,
  GameEvent,
  InputState,
  MatchStatus,
  Projectile,
  Ship,
  ShipKind,
  ShipSnapshot,
  WorldSnapshot,
} from './types';

/** Fixed simulation step: 60 Hz, independent of the display frame rate. */
export const FIXED_STEP = 1 / 60;

function createShip(id: number, kind: ShipKind, stats: ShipStats, x: number, y: number, angle: number): Ship {
  return {
    id,
    kind,
    x,
    y,
    angle,
    speed: 0,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    radius: stats.radius,
    alive: true,
    cooldowns: { front: 0, left: 0, right: 0, enemy: 0 },
    blocked: false,
    avoidSide: 0,
  };
}

function snapshotShip(ship: Ship): ShipSnapshot {
  return {
    id: ship.id,
    kind: ship.kind,
    x: ship.x,
    y: ship.y,
    angle: ship.angle,
    speed: ship.speed,
    health: ship.health,
    maxHealth: ship.maxHealth,
    cooldowns: { ...ship.cooldowns },
  };
}

/**
 * Pure game rules. No rendering, timers or DOM: the caller advances it with
 * `step(dt, input)` and reads entities/events. All randomness comes from the
 * seeded RNG, so a seed + input sequence fully reproduces a match.
 */
export class Simulation {
  readonly config: GameConfig;
  readonly arena: ArenaDefinition;
  readonly player: Ship;
  readonly enemies: Ship[] = [];
  readonly projectiles: Projectile[] = [];

  private readonly rng: Rng;
  private status: MatchStatus = 'running';
  private endReason: EndReason | null = null;
  private score = 0;
  private elapsed = 0;
  private spawnTimer: number;
  private spawnIndex = 0;
  private spawnedByKind = { chaser: 0, shooter: 0 };
  private idCounter = 1;
  private readonly ids = { nextId: (): number => this.idCounter++ };

  constructor(config: GameConfig, seed: number, arena: ArenaDefinition = DEFAULT_ARENA) {
    this.config = config;
    this.arena = arena;
    this.rng = createRng(seed);
    const spawn = arena.playerSpawn;
    this.player = createShip(this.ids.nextId(), 'player', config.player, spawn.x, spawn.y, spawn.angle);
    this.spawnTimer = config.spawn.initialDelay;
  }

  get isRunning(): boolean {
    return this.status === 'running';
  }

  /** Advances the match by `dt` seconds. Returns the events of this step. */
  step(dt: number, input: InputState): GameEvent[] {
    if (this.status !== 'running') return [];
    const events: GameEvent[] = [];
    this.elapsed = Math.min(this.config.sessionSeconds, this.elapsed + dt);

    this.updatePlayer(input, dt, events);
    this.updateSpawner(dt, events);
    this.updateEnemies(dt, events);
    this.updateProjectiles(dt, events);
    this.resolveRams(events);
    separateShips([this.player, ...this.enemies], this.arena);
    this.removeDead();
    this.checkEnd(events);
    return events;
  }

  /** Adds an enemy at a given pose. Used by spawns and by test instrumentation. */
  addEnemy(kind: Exclude<ShipKind, 'player'>, x: number, y: number, angle?: number): Ship {
    const stats = kind === 'chaser' ? this.config.chaser : this.config.shooter;
    const heading = angle ?? Math.atan2(this.player.y - y, this.player.x - x);
    const ship = createShip(this.ids.nextId(), kind, stats, x, y, heading);
    resolveStaticCollisions(ship, this.arena);
    this.enemies.push(ship);
    this.spawnedByKind[kind] += 1;
    return ship;
  }

  snapshot(): WorldSnapshot {
    return {
      status: this.status,
      endReason: this.endReason,
      score: this.score,
      elapsed: this.elapsed,
      timeLeft: Math.max(0, this.config.sessionSeconds - this.elapsed),
      player: snapshotShip(this.player),
      enemies: this.enemies.map(snapshotShip),
      projectiles: this.projectiles.length,
      spawned: { ...this.spawnedByKind },
    };
  }

  private updatePlayer(input: InputState, dt: number, events: GameEvent[]): void {
    const player = this.player;
    const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
    applySteering(player, this.config.player, { turn, throttle: input.forward }, dt);
    moveShip(player, this.arena, dt);
    tickCooldowns(player, dt);

    const radius = this.config.projectileRadius;
    if (input.fireFront) {
      const shot = fireFront(player, 'front', 'player', this.config.player.frontCannon, radius, this.ids);
      if (shot) this.launch([shot], player, 'front', player.angle, events);
    }
    for (const side of ['left', 'right'] as const) {
      const pressed = side === 'left' ? input.fireLeft : input.fireRight;
      if (!pressed) continue;
      const shots = fireBroadside(player, side, this.config.player.broadside, radius, this.ids);
      const angle = player.angle + (side === 'left' ? -Math.PI / 2 : Math.PI / 2);
      if (shots.length > 0) this.launch(shots, player, side, angle, events);
    }
  }

  private launch(shots: Projectile[], ship: Ship, weapon: Projectile['weapon'], angle: number, events: GameEvent[]): void {
    this.projectiles.push(...shots);
    events.push({ type: 'fire', shipId: ship.id, weapon, x: ship.x, y: ship.y, angle });
  }

  private updateSpawner(dt: number, events: GameEvent[]): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const aliveEnemies = this.enemies.filter((enemy) => enemy.alive).length;
    if (aliveEnemies >= this.config.spawn.maxEnemies) {
      this.spawnTimer += this.config.spawnIntervalSeconds;
      return;
    }
    const kind = pickEnemyKind(this.spawnIndex, this.config, this.rng);
    const radius = kind === 'chaser' ? this.config.chaser.radius : this.config.shooter.radius;
    const point = findSpawnPoint(radius, this.player, this.enemies, this.config, this.arena, this.rng);
    if (!point) {
      this.spawnTimer = this.config.spawn.retryDelay;
      return;
    }
    const ship = this.addEnemy(kind, point.x, point.y);
    this.spawnIndex += 1;
    this.spawnTimer += this.config.spawnIntervalSeconds;
    events.push({ type: 'spawn', shipId: ship.id, kind, x: ship.x, y: ship.y });
  }

  private updateEnemies(dt: number, events: GameEvent[]): void {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      tickCooldowns(enemy, dt);
      if (enemy.kind === 'chaser') {
        updateChaser(enemy, this.player, this.config, this.arena, dt);
      } else {
        const decision = updateShooter(enemy, this.player, this.config, this.arena, dt);
        if (decision.shouldFire) {
          const shot = fireFront(enemy, 'enemy', 'enemy', this.config.shooter.cannon, this.config.projectileRadius, this.ids);
          if (shot) this.launch([shot], enemy, 'enemy', enemy.angle, events);
        }
      }
      moveShip(enemy, this.arena, dt);
    }
  }

  private updateProjectiles(dt: number, events: GameEvent[]): void {
    const { hits } = updateProjectiles(this.projectiles, this.player, this.enemies, this.arena, dt, events);
    for (const { projectile, target } of hits) {
      events.push({ type: 'hit', targetId: target.id, faction: projectile.faction, x: projectile.x, y: projectile.y, damage: projectile.damage });
      const destroyed = applyDamage(target, projectile.damage);
      if (!destroyed) continue;
      const byPlayer = projectile.faction === 'player' && target.kind !== 'player';
      this.recordDestroyed(target, byPlayer, events);
    }
  }

  /** Chasers explode on contact with the player. Self-destruction never scores. */
  private resolveRams(events: GameEvent[]): void {
    const player = this.player;
    for (const enemy of this.enemies) {
      if (!enemy.alive || enemy.kind !== 'chaser' || !player.alive) continue;
      if (!circlesOverlap(enemy.x, enemy.y, enemy.radius, player.x, player.y, player.radius)) continue;
      const damage = this.config.chaser.contactDamage;
      events.push({ type: 'ram', shipId: enemy.id, x: enemy.x, y: enemy.y, damage });
      enemy.alive = false;
      enemy.health = 0;
      this.recordDestroyed(enemy, false, events);
      if (applyDamage(player, damage)) this.recordDestroyed(player, false, events);
    }
  }

  private recordDestroyed(ship: Ship, byPlayer: boolean, events: GameEvent[]): void {
    events.push({ type: 'destroyed', shipId: ship.id, kind: ship.kind, x: ship.x, y: ship.y, angle: ship.angle, byPlayer });
    if (byPlayer && this.status === 'running') {
      this.score += 1;
      events.push({ type: 'score', score: this.score });
    }
  }

  private removeDead(): void {
    const sunk = new Set(this.enemies.filter((enemy) => !enemy.alive).map((enemy) => enemy.id));
    const aliveEnemies = this.enemies.filter((enemy) => enemy.alive);
    this.enemies.splice(0, this.enemies.length, ...aliveEnemies);
    // A destroyed enemy stops dealing damage: its shots still in flight go with it.
    const aliveProjectiles = this.projectiles.filter((projectile) => projectile.alive && !sunk.has(projectile.ownerId));
    this.projectiles.splice(0, this.projectiles.length, ...aliveProjectiles);
  }

  private checkEnd(events: GameEvent[]): void {
    let reason: EndReason | null = null;
    if (!this.player.alive) reason = 'defeated';
    else if (this.elapsed >= this.config.sessionSeconds) reason = 'time_up';
    if (!reason) return;
    this.status = 'ended';
    this.endReason = reason;
    this.player.speed = 0;
    events.push({ type: 'ended', reason, score: this.score, elapsed: this.elapsed });
  }
}
