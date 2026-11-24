import { advance, expect, openApp, snapshot, startBattle, test } from './support';

test.describe('Navigation and abandonment', () => {
  test('abandoning from the pause menu records nothing', async ({ page }) => {
    await openApp(page);
    await startBattle(page);
    await advance(page, 3000);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);

    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.getByText('No battles recorded yet')).toBeVisible();
    await expect(page.getByText('waiting to be recorded')).toHaveCount(0);
  });

  test('a refresh during combat ends the match without recording it', async ({ page }) => {
    await openApp(page);
    await startBattle(page);
    await advance(page, 2000);
    await page.reload();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.getByText('No battles recorded yet')).toBeVisible();
  });

  test('repeated navigation between screens releases each match', async ({ page }) => {
    await openApp(page);
    for (let round = 0; round < 3; round += 1) {
      await startBattle(page);
      await advance(page, 1000);
      await expect(page.locator('canvas')).toHaveCount(1);
      await page.goBack();
      await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      expect(await page.evaluate(() => window.__PIRATE_BATTLE__)).toBeUndefined();
      await page.getByRole('button', { name: 'Options' }).click();
      await page.getByRole('button', { name: 'Main Menu' }).click();
    }
  });

  test('on-screen controls move and fire (touch or mouse)', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 10 } });
    await startBattle(page);
    // The on-screen pad is aria-hidden (keyboard has equivalents), so locate it by title.
    const forward = page.getByTitle('Sail forward');
    const box = await forward.boundingBox();
    if (!box) throw new Error('forward control not visible');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await advance(page, 800);
    await page.mouse.up();
    const moved = await snapshot(page);
    expect(moved.player.y).toBeLessThan(416 - 50);

    await page.getByTitle('Fire left broadside').dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
    await advance(page, 50);
    expect((await snapshot(page)).projectiles).toBe(3);
  });
});
