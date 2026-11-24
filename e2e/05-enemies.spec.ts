import { advance, expect, openApp, snapshot, spawnEnemy, startBattle, test } from './support';

test.describe('Enemies', () => {
  test('Chaser pursues, rams, explodes and does not score', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 10 } });
    await startBattle(page);
    const id = await spawnEnemy(page, 'chaser', 1000, 416, Math.PI);

    await advance(page, 800);
    const chasing = (await snapshot(page)).enemies.find((enemy) => enemy.id === id);
    expect(chasing?.x).toBeLessThan(1000 - 50);

    await advance(page, 2000);
    const state = await snapshot(page);
    expect(state.enemies.find((enemy) => enemy.id === id)).toBeUndefined();
    expect(state.player.health).toBe(80);
    expect(state.score).toBe(0);
  });

  test('Shooter approaches and fires when the player is in range', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 10 } });
    await startBattle(page);
    const id = await spawnEnemy(page, 'shooter', 1300, 416, Math.PI);

    await advance(page, 2000);
    const approaching = (await snapshot(page)).enemies.find((enemy) => enemy.id === id);
    expect(approaching?.x).toBeLessThan(1250);

    await advance(page, 4000);
    const state = await snapshot(page);
    const shooter = state.enemies.find((enemy) => enemy.id === id);
    expect(state.player.health).toBeLessThan(100);
    expect(shooter).toBeDefined();
    expect(Math.hypot(shooter!.x - state.player.x, shooter!.y - state.player.y)).toBeGreaterThan(200);
  });

  test('spawns both enemy types on the configured interval', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 2 } });
    await startBattle(page);
    await advance(page, 900);
    expect((await snapshot(page)).spawned).toEqual({ chaser: 0, shooter: 0 });
    // First spawn at 1 s, then every 2 s: 1, 3, 5, 7 → 4 spawns by 7.1 s.
    await advance(page, 6200);
    const { spawned } = await snapshot(page);
    expect(spawned.chaser + spawned.shooter).toBe(4);
    expect(spawned.chaser).toBeGreaterThanOrEqual(1);
    expect(spawned.shooter).toBeGreaterThanOrEqual(1);
  });
});
