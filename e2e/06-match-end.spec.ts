import { advance, expect, hold, openApp, runToEnd, snapshot, spawnEnemy, startBattle, test, type GameSnapshot } from './support';

test.describe('End of match', () => {
  test('ends by time, freezes the simulation and shows the result', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 60, spawnIntervalSeconds: 10 } });
    await startBattle(page);
    // Run to the end, then try to sail and fire for another simulated second.
    // Done in one evaluate: the result screen replaces the arena 1.2 s (real
    // time) after the end, so separate round-trips could race it.
    const { ended, frozen } = await page.evaluate(() => {
      const api = window.__PIRATE_BATTLE__!;
      for (let i = 0; i < 70 && (api.snapshot() as { status: string }).status === 'running'; i += 1) api.advance(1000);
      const endedState = api.snapshot();
      for (const code of ['KeyW', 'Space']) window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));
      api.advance(1000);
      const frozenState = api.snapshot();
      for (const code of ['KeyW', 'Space']) window.dispatchEvent(new KeyboardEvent('keyup', { code, cancelable: true }));
      return { ended: endedState as unknown as GameSnapshot, frozen: frozenState as unknown as GameSnapshot };
    });
    if (ended.endReason === 'time_up') {
      expect(ended.elapsed).toBe(60);
      expect(ended.timeLeft).toBe(0);
    }
    expect(ended.status).toBe('ended');
    expect(frozen.player).toEqual(ended.player);
    expect(frozen.score).toBe(ended.score);
    expect(frozen.spawned).toEqual(ended.spawned);
    expect(frozen.elapsed).toBe(ended.elapsed);

    await expect(page).toHaveURL(/#\/result$/);
    await expect(page.getByTestId('result-score')).toHaveText(String(ended.score));
  });

  test('ends by defeat when health reaches zero', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 10 } });
    await startBattle(page);
    const offsets: ReadonlyArray<readonly [number, number]> = [
      [150, 0],
      [-150, 0],
      [0, 150],
      [0, -150],
      [110, 110],
      [-110, -110],
    ];
    for (const [dx, dy] of offsets) {
      await spawnEnemy(page, 'chaser', 704 + dx, 416 + dy);
    }
    await advance(page, 3000);
    const state = await snapshot(page);
    expect(state.status).toBe('ended');
    expect(state.endReason).toBe('defeated');
    expect(state.player.health).toBe(0);
    expect(state.score).toBe(0);

    await expect(page.getByRole('heading', { name: 'Ship Sunk' })).toBeVisible();
    await expect(page.getByTestId('result-meta')).toContainText('Defeated');
  });

  test('Play Again starts a clean match', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 60, spawnIntervalSeconds: 1 } });
    await startBattle(page);
    await hold(page, ['KeyW', 'Space'], 3000);
    await runToEnd(page);
    await expect(page).toHaveURL(/#\/result$/);

    await page.getByRole('button', { name: 'Play Again' }).click();
    await page.waitForFunction(() => {
      const state = window.__PIRATE_BATTLE__?.snapshot() as { elapsed: number } | undefined;
      return state !== undefined && state.elapsed === 0;
    });
    const fresh = await snapshot(page);
    expect(fresh.status).toBe('running');
    expect(fresh.score).toBe(0);
    expect(fresh.player.health).toBe(100);
    expect(fresh.timeLeft).toBe(60);
    expect(fresh.enemies).toHaveLength(0);
    expect(fresh.projectiles).toBe(0);
    expect(await page.locator('canvas').count()).toBe(1);
  });
});
