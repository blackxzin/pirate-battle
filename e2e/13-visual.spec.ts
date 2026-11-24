import { expect, openApp, runToEnd, startBattle, test } from './support';

/**
 * Visual regression. Baselines live in e2e/__screenshots__/<project>/ and are
 * versioned; update them with `npm run test:e2e:update` after intended changes.
 */
test.describe('Visual regression', () => {
  test('main menu', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('menu.png', { fullPage: true });
  });

  test('arena in a stable state', async ({ page }) => {
    await openApp(page, { seed: 3 });
    await startBattle(page);
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 60, spawnIntervalSeconds: 10 } });
    await startBattle(page);
    await runToEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'saved');
    await expect(page).toHaveScreenshot('result.png', { mask: [page.getByTestId('result-score')] });
  });
});
