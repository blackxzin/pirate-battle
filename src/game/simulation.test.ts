import { describe, expect, it } from 'vitest';
import type { ArenaDefinition } from './arena';
import { createGameConfig, isValidSessionSeconds, isValidSpawnSeconds, normalizeMatchOptions } from './config';
import { FIXED_STEP, Simulation } from './simulation';
import { EMPTY_INPUT, type GameEvent, type InputState } from './types';

const OPEN_ARENA: ArenaDefinition = {
  width: 1600,
  height: 900,
  islands: [],
  decorations: [],
  playerSpawn: { x: 800, y: 450, angle: 0 },
};

const ISLAND_ARENA: ArenaDefinition = {
  ...OPEN_ARENA,
  islands: [
    { id: 'rock', style: 'sand', tileX: 0, tileY: 0, cols: 1, rows: 1, collider: { x: 1000, y: 350, width: 200, height: 200 } },
  ],
};

function makeSim(arena: ArenaDefinition = OPEN_ARENA, spawnSeconds = 10, sessionSeconds = 60): Simulation {
  // Long initial delay keeps the arena empty unless a test spawns enemies.
  const config = createGameConfig(
    { sessionSeconds, spawnIntervalSeconds: spawnSeconds },
    { spawn: { initialDelay: 999, chaserWeight: 0.5, minDistanceFromPlayer: 420, clearance: 24, edgeMargin: 48, maxEnemies: 12, attempts: 40, retryDelay: 0.25 } },
  );
  return new Simulation(config, 42, arena);
}

function run(sim: Simulation, seconds: number, input: InputState = EMPTY_INPUT): GameEvent[] {
  const events: GameEvent[] = [];
  const steps = Math.round(seconds / FIXED_STEP);
  for (let i = 0; i < steps; i += 1) events.push(...sim.step(FIXED_STEP, input));
  return events;
}

const press = (partial: Partial<InputState>): InputState => ({ ...EMPTY_INPUT, ...partial });

describe('config', () => {
  it('clamps and snaps options to documented limits', () => {
    expect(normalizeMatchOptions({ sessionSeconds: 500, spawnIntervalSeconds: 0.1 })).toEqual({
      sessionSeconds: 180,
      spawnIntervalSeconds: 1,
    });
    expect(normalizeMatchOptions({ sessionSeconds: 94, spawnIntervalSeconds: 2.7 })).toEqual({
      sessionSeconds: 90,
      spawnIntervalSeconds: 2.5,
    });
  });

  it('accepts only values inside the limits and on a step', () => {
    expect([60, 130, 180].every(isValidSessionSeconds)).toBe(true);
    expect([50, 65, 190, Number.NaN, '120'].some(isValidSessionSeconds)).toBe(false);
    expect([1, 2.5, 10].every(isValidSpawnSeconds)).toBe(true);
    expect([0.5, 1.3, 10.5, Infinity].some(isValidSpawnSeconds)).toBe(false);
  });

  it('creates a frozen snapshot', () => {
    const config = createGameConfig({ sessionSeconds: 120, spawnIntervalSeconds: 3 });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.player.frontCannon)).toBe(true);
  });
});

describe('player movement', () => {
  it('moves forward along the heading and rotates both ways', () => {
    const sim = makeSim();
    run(sim, 1, press({ forward: true }));
    expect(sim.player.x).toBeGreaterThan(850);
    expect(sim.player.y).toBeCloseTo(450, 5);

    const before = sim.player.angle;
    run(sim, 0.5, press({ turnRight: true }));
    expect(sim.player.angle).toBeGreaterThan(before);
    run(sim, 1, press({ turnLeft: true }));
    expect(sim.player.angle).toBeLessThan(before);
  });

  it('is frame-rate independent', () => {
    const fine = makeSim();
    const coarse = makeSim();
    for (let i = 0; i < 120; i += 1) fine.step(1 / 120, press({ forward: true }));
    for (let i = 0; i < 30; i += 1) coarse.step(1 / 30, press({ forward: true }));
    expect(Math.abs(fine.player.x - coarse.player.x)).toBeLessThan(4);
  });

  it('stays inside the arena', () => {
    const sim = makeSim();
    run(sim, 10, press({ forward: true }));
    expect(sim.player.x).toBeLessThanOrEqual(OPEN_ARENA.width - sim.player.radius);
  });

  it('cannot cross islands', () => {
    const sim = makeSim(ISLAND_ARENA);
    run(sim, 6, press({ forward: true }));
    expect(sim.player.x).toBeLessThanOrEqual(1000 - sim.player.radius + 0.5);
  });
});

describe('weapons', () => {
  it('fires one front projectile and respects the cooldown', () => {
    const sim = makeSim();
    const events = run(sim, 0.2, press({ fireFront: true }));
    expect(events.filter((event) => event.type === 'fire')).toHaveLength(1);
    expect(sim.projectiles).toHaveLength(1);
    const later = run(sim, 0.3, press({ fireFront: true }));
    expect(later.filter((event) => event.type === 'fire')).toHaveLength(1);
  });

  it('fires three parallel broadside projectiles per side', () => {
    const sim = makeSim();
    sim.step(FIXED_STEP, press({ fireLeft: true }));
    expect(sim.projectiles).toHaveLength(3);
    for (const projectile of sim.projectiles) {
      expect(projectile.vx).toBeCloseTo(0, 5);
      expect(projectile.vy).toBeLessThan(0);
    }
    sim.step(FIXED_STEP, press({ fireRight: true }));
    expect(sim.projectiles.filter((projectile) => projectile.vy > 0)).toHaveLength(3);
  });

  it('removes projectiles at max range', () => {
    const sim = makeSim();
    sim.step(FIXED_STEP, press({ fireFront: true }));
    const events = run(sim, 2);
    expect(sim.projectiles).toHaveLength(0);
    expect(events.some((event) => event.type === 'projectile_end')).toBe(true);
  });

  it('stops projectiles at islands', () => {
    const sim = makeSim(ISLAND_ARENA);
    sim.step(FIXED_STEP, press({ fireFront: true }));
    const events = run(sim, 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'projectile_end', cause: 'island' }));
  });
});

describe('combat and scoring', () => {
  it('scores once per enemy destroyed by the player', () => {
    const sim = makeSim();
    const target = sim.addEnemy('shooter', 1000, 450, Math.PI);
    target.health = 25;
    const events = run(sim, 1, press({ fireFront: true }));
    expect(events.filter((event) => event.type === 'hit' && event.faction === 'player')).toHaveLength(1);
    expect(sim.snapshot().score).toBe(1);
    expect(sim.enemies).toHaveLength(0);
  });

  it('damages each target only once per projectile', () => {
    const sim = makeSim();
    const first = sim.addEnemy('shooter', 1000, 450, Math.PI);
    const second = sim.addEnemy('shooter', 1060, 450, Math.PI);
    sim.step(FIXED_STEP, press({ fireFront: true }));
    run(sim, 0.6);
    expect(first.health).toBe(first.maxHealth - 25);
    expect(second.health).toBe(second.maxHealth);
  });

  it('chaser ramming damages the player, explodes and does not score', () => {
    const sim = makeSim();
    const chaser = sim.addEnemy('chaser', 900, 450);
    const events = run(sim, 2);
    expect(chaser.alive).toBe(false);
    expect(sim.player.health).toBe(sim.player.maxHealth - sim.config.chaser.contactDamage);
    expect(events).toContainEqual(expect.objectContaining({ type: 'destroyed', shipId: chaser.id, byPlayer: false }));
    expect(sim.snapshot().score).toBe(0);
  });

  it('shooter approaches and fires when in range', () => {
    const sim = makeSim();
    const shooter = sim.addEnemy('shooter', 1350, 450);
    const events = run(sim, 4);
    expect(shooter.x).toBeLessThan(1350);
    expect(events).toContainEqual(expect.objectContaining({ type: 'fire', shipId: shooter.id, weapon: 'enemy' }));
    expect(sim.player.health).toBeLessThan(sim.player.maxHealth);
  });
});

describe('enemies and the world', () => {
  it('enemies never sail through islands while chasing', () => {
    const sim = makeSim(ISLAND_ARENA);
    const chaser = sim.addEnemy('chaser', 1450, 450, Math.PI);
    const shooter = sim.addEnemy('shooter', 1450, 520, Math.PI);
    const rock = ISLAND_ARENA.islands[0]!.collider;
    for (let i = 0; i < Math.round(4 / FIXED_STEP); i += 1) {
      sim.step(FIXED_STEP, EMPTY_INPUT);
      for (const ship of [chaser, shooter].filter((enemy) => enemy.alive)) {
        const insideX = ship.x > rock.x + 1 && ship.x < rock.x + rock.width - 1;
        const insideY = ship.y > rock.y + 1 && ship.y < rock.y + rock.height - 1;
        expect(insideX && insideY).toBe(false);
      }
    }
  });

  it('a destroyed enemy stops firing, dealing damage and colliding', () => {
    const sim = makeSim();
    const shooter = sim.addEnemy('shooter', 1000, 450, Math.PI);
    shooter.health = 25;
    run(sim, 0.5, press({ fireFront: true }));
    expect(shooter.alive).toBe(false);
    expect(sim.enemies).not.toContain(shooter);

    const healthBefore = sim.player.health;
    const later = run(sim, 4, press({ forward: true }));
    expect(later.some((event) => 'shipId' in event && event.shipId === shooter.id && event.type === 'fire')).toBe(false);
    expect(sim.player.health).toBe(healthBefore);
    // The player sails straight through where the wreck was.
    expect(sim.player.x).toBeGreaterThan(1050);
  });

  it('enemy projectiles damage the player once each', () => {
    const sim = makeSim();
    const shooter = sim.addEnemy('shooter', 1100, 450, Math.PI);
    const events = run(sim, 1.2);
    const enemyHits = events.filter((event) => event.type === 'hit' && event.faction === 'enemy');
    expect(enemyHits.length).toBeGreaterThan(0);
    expect(sim.player.health).toBe(sim.player.maxHealth - enemyHits.length * sim.config.shooter.cannon.damage);
    expect(shooter.alive).toBe(true);
  });

  it('removes projectiles that leave the arena', () => {
    const arena: ArenaDefinition = { ...OPEN_ARENA, playerSpawn: { x: 1500, y: 450, angle: 0 } };
    const sim = makeSim(arena);
    const events = [...sim.step(FIXED_STEP, press({ fireFront: true }))];
    expect(events.some((event) => event.type === 'fire')).toBe(true);
    events.push(...run(sim, 0.5));
    expect(sim.projectiles).toHaveLength(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'projectile_end', cause: 'out_of_bounds' }));
  });
});

describe('spawning', () => {
  it('spawns on the configured interval, away from the player and islands, with both types', () => {
    const config = createGameConfig({ sessionSeconds: 60, spawnIntervalSeconds: 2 });
    const sim = new Simulation(config, 7, ISLAND_ARENA);
    const events = run(sim, 1 + 2 * 3 + 0.1);
    const spawns = events.filter((event): event is Extract<GameEvent, { type: 'spawn' }> => event.type === 'spawn');
    expect(spawns).toHaveLength(4);
    expect(spawns.map((spawn) => spawn.kind).slice(0, 2)).toEqual(['chaser', 'shooter']);
    for (const spawn of spawns) {
      expect(Math.hypot(spawn.x - 800, spawn.y - 450)).toBeGreaterThanOrEqual(config.spawn.minDistanceFromPlayer - 200);
    }
  });

  it('is deterministic for a given seed', () => {
    const config = createGameConfig({ sessionSeconds: 60, spawnIntervalSeconds: 1 });
    const a = new Simulation(config, 99);
    const b = new Simulation(config, 99);
    run(a, 8);
    run(b, 8);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
});

describe('match end', () => {
  it('ends by time and freezes the simulation', () => {
    const sim = makeSim(OPEN_ARENA, 10, 60);
    const events = run(sim, 61, press({ forward: true }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'ended', reason: 'time_up' }));
    const frozen = sim.snapshot();
    run(sim, 1, press({ forward: true, fireFront: true }));
    expect(sim.snapshot()).toEqual(frozen);
    expect(frozen.elapsed).toBe(60);
  });

  it('ends by defeat when health reaches zero', () => {
    const sim = makeSim();
    sim.player.health = 10;
    sim.addEnemy('chaser', 900, 450);
    const events = run(sim, 2);
    expect(events).toContainEqual(expect.objectContaining({ type: 'ended', reason: 'defeated' }));
    expect(sim.snapshot().status).toBe('ended');
  });
});
