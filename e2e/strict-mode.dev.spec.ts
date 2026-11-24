import { advance, expect, openApp, snapshot, startBattle, test } from './support';

/**
 * Runs against the Vite dev server, where React Strict Mode mounts, unmounts
 * and remounts every effect. Exactly one match (one canvas, one ticker) must
 * survive, and leaving must release it.
 */
test.describe('React Strict Mode (dev server)', () => {
  test('creates exactly one session and releases it on exit', async ({ page }) => {
    await openApp(page);
    for (let round = 0; round < 2; round += 1) {
      await startBattle(page);
      await expect(page.locator('canvas')).toHaveCount(1);
      await advance(page, 1000);
      const state = await snapshot(page);
      expect(state.elapsed).toBeCloseTo(1, 5);
      expect(state.status).toBe('running');

      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Main Menu' }).click();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      expect(await page.evaluate(() => window.__PIRATE_BATTLE__)).toBeUndefined();
    }
  });
});
