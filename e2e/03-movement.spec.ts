import { expect, hold, openApp, snapshot, startBattle, test } from './support';

const ARENA = { width: 1536, height: 896 };
const SPAWN = { x: 704, y: 416 };
/** Collider of the north-west island (src/game/arena.ts). */
const NW_ISLAND = { x: 206, y: 142, width: 228, height: 228 };

function distanceToRect(x: number, y: number, rect: typeof NW_ISLAND): number {
  const nx = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const ny = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  return Math.hypot(x - nx, y - ny);
}

test.describe('Movement', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 10 } });
    await startBattle(page);
  });

  test('starts at the spawn point and sails forward along the heading', async ({ page }) => {
    const start = await snapshot(page);
    expect(start.player.x).toBe(SPAWN.x);
    expect(start.player.y).toBe(SPAWN.y);
    expect(start.player.health).toBe(100);

    await hold(page, ['KeyW'], 1000);
    const after = await snapshot(page);
    expect(after.player.y).toBeLessThan(SPAWN.y - 80);
    expect(after.player.x).toBeCloseTo(SPAWN.x, 3);
  });

  test('rotates both ways and can move while turning', async ({ page }) => {
    const start = await snapshot(page);
    await hold(page, ['KeyD'], 500);
    const right = await snapshot(page);
    expect(right.player.angle).toBeGreaterThan(start.player.angle + 1);

    await hold(page, ['ArrowLeft'], 1000);
    const left = await snapshot(page);
    expect(left.player.angle).toBeLessThan(right.player.angle - 2);

    await hold(page, ['ArrowUp', 'KeyD'], 800);
    const both = await snapshot(page);
    expect(both.player.angle).not.toBeCloseTo(left.player.angle, 1);
    expect(Math.hypot(both.player.x - left.player.x, both.player.y - left.player.y)).toBeGreaterThan(30);
  });

  test('stays inside the visible arena', async ({ page }) => {
    await hold(page, ['KeyW'], 5000);
    const state = await snapshot(page);
    const radius = 26;
    expect(state.player.y).toBeGreaterThanOrEqual(radius - 0.01);
    expect(state.player.y).toBeLessThan(radius + 2);
    expect(state.player.x).toBeLessThanOrEqual(ARENA.width - radius);
  });

  test('cannot sail through islands', async ({ page }) => {
    // Aim at the north-west island (turn left ~1.17 rad), then sail into it.
    await hold(page, ['KeyA'], 450);
    for (let i = 0; i < 8; i += 1) {
      await hold(page, ['KeyW'], 500);
      const state = await snapshot(page);
      expect(distanceToRect(state.player.x, state.player.y, NW_ISLAND)).toBeGreaterThanOrEqual(26 - 0.5);
    }
    const final = await snapshot(page);
    expect(final.player.x).toBeLessThan(SPAWN.x - 150);
    expect(final.player.x).toBeGreaterThan(NW_ISLAND.x + NW_ISLAND.width);
  });
});
