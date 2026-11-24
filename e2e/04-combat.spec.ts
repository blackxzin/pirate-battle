import { advance, expect, hold, openApp, snapshot, spawnEnemy, startBattle, test } from './support';

test.describe('Combat', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 10 } });
    await startBattle(page);
  });

  test('front cannon fires one projectile and respects its cooldown', async ({ page }) => {
    await page.keyboard.down('Space');
    await advance(page, 100);
    expect((await snapshot(page)).projectiles).toBe(1);
    await advance(page, 200);
    expect((await snapshot(page)).projectiles).toBe(1);
    await advance(page, 100);
    expect((await snapshot(page)).projectiles).toBe(2);
    await page.keyboard.up('Space');
  });

  test('broadsides fire three parallel projectiles per side', async ({ page }) => {
    await hold(page, ['KeyQ'], 50);
    const left = await snapshot(page);
    expect(left.projectiles).toBe(3);
    expect(left.player.cooldowns.left).toBeGreaterThan(1);

    await hold(page, ['KeyE'], 50);
    expect((await snapshot(page)).projectiles).toBe(6);

    await hold(page, ['KeyQ'], 300);
    expect((await snapshot(page)).projectiles).toBe(6);
  });

  test('each projectile damages once and kills score exactly one point', async ({ page }) => {
    const id = await spawnEnemy(page, 'shooter', 704, 200, Math.PI / 2);
    await hold(page, ['Space'], 16);
    await advance(page, 600);
    let target = (await snapshot(page)).enemies.find((enemy) => enemy.id === id);
    expect(target?.health).toBe(70 - 25);

    await hold(page, ['Space'], 1100);
    await advance(page, 400);
    const state = await snapshot(page);
    expect(state.enemies.find((enemy) => enemy.id === id)).toBeUndefined();
    expect(state.score).toBe(1);
    await expect(page.getByTestId('hud-score')).toContainText('1');

    await advance(page, 1000);
    target = (await snapshot(page)).enemies.find((enemy) => enemy.id === id);
    expect(target).toBeUndefined();
    expect((await snapshot(page)).score).toBe(1);
  });
});
