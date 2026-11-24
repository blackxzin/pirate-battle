import { advance, expect, openApp, snapshot, startBattle, test } from './support';

test.describe('Pause', () => {
  test('manual pause freezes time and cooldowns; resume needs an action and drops held keys', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 10 } });
    await startBattle(page);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('Space');
    await advance(page, 500);
    const before = await snapshot(page);

    await page.keyboard.press('KeyP');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await expect(page.getByTestId('status-phase')).toHaveText('paused');
    await advance(page, 5000);
    const during = await snapshot(page);
    expect(during.timeLeft).toBe(before.timeLeft);
    expect(during.player.cooldowns).toEqual(before.player.cooldowns);
    expect(during.player.y).toBe(before.player.y);

    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await advance(page, 1500);
    const after = await snapshot(page);
    expect(after.player.speed).toBe(0);
    expect(after.timeLeft).toBeCloseTo(before.timeLeft - 1.5, 5);
  });

  test('Escape pauses and Escape resumes', async ({ page }) => {
    await openApp(page);
    await startBattle(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('status-phase')).toHaveText('running');
    const before = await snapshot(page);
    await advance(page, 1000);
    expect((await snapshot(page)).timeLeft).toBeCloseTo(before.timeLeft - 1, 5);
  });

  test('pauses automatically on focus loss and hidden tab', async ({ page }) => {
    await openApp(page);
    await startBattle(page);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByRole('dialog', { name: 'Paused' })).toContainText('lost focus');
    await page.getByRole('button', { name: 'Resume' }).click();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('dialog', { name: 'Paused' })).toContainText('tab was hidden');
  });

  test('real-time clock does not advance while paused', async ({ page }) => {
    await openApp(page, { manualClock: false });
    await startBattle(page);
    await page.waitForFunction(() => (window.__PIRATE_BATTLE__!.snapshot() as { elapsed: number }).elapsed > 0.5);
    await page.getByRole('button', { name: 'Pause' }).click();
    const paused = await snapshot(page);
    await page.waitForTimeout(2000);
    const later = await snapshot(page);
    expect(later.elapsed).toBe(paused.elapsed);
    expect(later.phase).toBe('paused');

    await page.getByRole('button', { name: 'Resume' }).click();
    await page.waitForFunction((value) => (window.__PIRATE_BATTLE__!.snapshot() as { elapsed: number }).elapsed > value, paused.elapsed);
    const resumed = await snapshot(page);
    // No catch-up jump: the paused 2 s were discarded.
    expect(resumed.elapsed - paused.elapsed).toBeLessThan(1);
  });
});
