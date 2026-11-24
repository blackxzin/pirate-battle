import type { Page } from '@playwright/test';
import { expect, openApp, runToEnd, startBattle, test } from './support';

async function finishMatch(page: Page): Promise<void> {
  await startBattle(page);
  await runToEnd(page);
  await expect(page).toHaveURL(/#\/result$/);
}

test.describe('Match registration', () => {
  test('a completed match updates both tabs', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 60, spawnIntervalSeconds: 3 } });
    await finishMatch(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'saved');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Ranking' }).click();
    const ranking = page.getByTestId('ranking-table');
    await expect(ranking.locator('tbody tr')).toHaveCount(1);
    await expect(ranking.getByText('You')).toBeVisible();

    await page.getByRole('tab', { name: 'Match History' }).click();
    const history = page.getByTestId('history-table');
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await expect(history.locator('tbody tr').first()).toHaveAttribute('data-highlight', 'true');
  });

  test('a failed registration stays pending across refresh and recovers', async ({ page, consoleGuard }) => {
    test.setTimeout(90_000);
    consoleGuard.allowNetworkErrors();
    await openApp(page, { scenario: 'submit-unavailable', options: { sessionSeconds: 60, spawnIntervalSeconds: 3 } });
    await finishMatch(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'pending', { timeout: 15_000 });

    // Another match can start while the record is pending.
    await page.getByRole('button', { name: 'Play Again' }).click();
    await page.waitForFunction(() => window.__PIRATE_BATTLE__ !== undefined);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByText('1 battle is waiting to be recorded')).toBeVisible();

    await page.reload();
    await expect(page.getByText('1 battle is waiting to be recorded')).toBeVisible();

    // The service recovers; pending records are flushed on start-up.
    await page.evaluate(() => localStorage.setItem('pirate-battle:mock-scenario:v1', 'normal'));
    await page.goto('/?e2e=1&clock=manual&seed=1#/log/history');
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByText('waiting to be recorded')).toHaveCount(0);
  });
});
