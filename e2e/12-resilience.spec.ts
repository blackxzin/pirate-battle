import { expect, openApp, runToEnd, startBattle, test } from './support';

test.describe('Registration resilience', () => {
  test('timeout after the server saved the match is retried without duplicates', async ({ page, consoleGuard }) => {
    test.setTimeout(90_000);
    consoleGuard.allowNetworkErrors();
    await openApp(page, { scenario: 'submit-timeout-after-save', options: { sessionSeconds: 60, spawnIntervalSeconds: 3 } });
    await startBattle(page);
    await runToEnd(page);
    await expect(page).toHaveURL(/#\/result$/);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'saving');
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'saved', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect(page.getByTestId('ranking-table').locator('tbody tr')).toHaveCount(1);
  });

  test('repeated retry clicks never duplicate a record', async ({ page, consoleGuard }) => {
    test.setTimeout(90_000);
    consoleGuard.allowNetworkErrors();
    await openApp(page, { scenario: 'submit-unavailable', options: { sessionSeconds: 60, spawnIntervalSeconds: 3 } });
    await startBattle(page);
    await runToEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'pending', { timeout: 15_000 });

    await page.evaluate(() => localStorage.setItem('pirate-battle:mock-scenario:v1', 'normal'));
    await expect(page.getByRole('button', { name: 'Retry now' })).toBeVisible();
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/matches')) posts.push(request.url());
    });
    // Three real clicks in one task, before React can hide the button.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Retry now');
      if (!button) throw new Error('Retry button missing');
      button.click();
      button.click();
      button.click();
    });
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
    expect(posts).toHaveLength(1);

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Match History' }).click();
    await expect(page.getByTestId('history-table').locator('tbody tr')).toHaveCount(1);
  });

  test('API failures never block the game', async ({ page, consoleGuard }) => {
    consoleGuard.allowNetworkErrors();
    await openApp(page, { scenario: 'server-error' });
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByLabel('Game session time', { exact: true }).fill('60');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await startBattle(page);
    await runToEnd(page);
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
  });
});
