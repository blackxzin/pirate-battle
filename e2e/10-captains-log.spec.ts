import { expect, openApp, test } from './support';

test.describe("Captain's Log", () => {
  test('ranking is paginated and ordered by score', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking' });
    const table = page.getByTestId('ranking-table');
    await expect(page.getByText('120 second battles · 3 second spawn interval')).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(table.locator('tbody tr').first()).toContainText('Captain Flint');
    await expect(table.locator('tbody tr').first()).toContainText('38');
    await expect(page.getByText('Page 1 of 4')).toBeVisible();

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 4')).toBeVisible();
    await expect(table.locator('tbody tr').first()).toContainText('06');
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(page.getByText('Page 1 of 4')).toBeVisible();
  });

  test('history shows the empty state and tabs are keyboard operable', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking' });
    await page.getByRole('tab', { name: 'Ranking' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Match History' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('No battles recorded yet. Set sail!')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Match History' })).toBeFocused();
    // Activating a tab with a click (or Enter on it) also keeps focus on that tab.
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Ranking' })).toBeFocused();
  });

  test('match history is paginated, newest first, with every field', async ({ page }) => {
    await openApp(page, { hash: '#/log/history' });
    await expect(page.getByText('No battles recorded yet')).toBeVisible();
    // Record 7 matches for this player through the real API (MSW + Axios path).
    await page.evaluate(async () => {
      const player = JSON.parse(localStorage.getItem('pirate-battle:player:v1') ?? '{}') as { id: string; name: string };
      for (let i = 0; i < 7; i += 1) {
        const record = {
          matchId: `history-${i}`,
          playerId: player.id,
          playerName: player.name,
          playedAt: new Date(Date.UTC(2026, 10, 20, 10, i)).toISOString(),
          score: i,
          durationMs: 60_000 + i * 1000,
          endReason: i % 2 === 0 ? 'time_up' : 'defeated',
          config: { sessionSeconds: 120, spawnIntervalSeconds: 3 },
        };
        const response = await fetch('/api/matches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        if (!response.ok) throw new Error(`POST failed: ${response.status}`);
      }
    });
    await page.reload();
    const table = page.getByTestId('history-table');
    await expect(table.locator('tbody tr')).toHaveCount(5);
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await expect(table.locator('thead')).toContainText(/Date.*Points.*Duration.*Result/);
    // Newest first: match 6 (01:06, time up) leads.
    await expect(table.locator('tbody tr').first()).toContainText('01:06');
    await expect(table.locator('tbody tr').first()).toContainText(/time up/i);
    await expect(table.locator('tbody tr').nth(1)).toContainText(/defeated/i);

    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table.locator('tbody tr').last()).toContainText('01:00');
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  test('shows a loading state on slow networks', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking', scenario: 'slow' });
    await expect(page.getByText('Loading the ranking…')).toBeVisible();
    await expect(page.getByTestId('ranking-table')).toBeVisible({ timeout: 10_000 });
  });

  test('shows empty lists', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking', scenario: 'empty' });
    await expect(page.getByText('No battles recorded for this configuration yet.')).toBeVisible();
  });

  test('ranking failure shows an error with retry; history still works', async ({ page, consoleGuard }) => {
    consoleGuard.allowNetworkErrors();
    await openApp(page, { hash: '#/log/ranking', scenario: 'ranking-error' });
    await expect(page.getByRole('alert')).toContainText('Could not load the ranking', { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByText('No battles recorded yet. Set sail!')).toBeVisible();

    await page.evaluate(() => localStorage.setItem('pirate-battle:mock-scenario:v1', 'normal'));
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await expect(page.getByTestId('ranking-table')).toBeVisible({ timeout: 15_000 });
  });

  test('history failure and connection errors are reported accessibly', async ({ page, consoleGuard }) => {
    consoleGuard.allowNetworkErrors();
    await openApp(page, { hash: '#/log/history', scenario: 'offline' });
    await expect(page.getByRole('alert')).toContainText('Could not reach the server', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test('client timeout is reported', async ({ page, consoleGuard }) => {
    test.setTimeout(60_000);
    consoleGuard.allowNetworkErrors();
    await openApp(page, { hash: '#/log/ranking', scenario: 'timeout' });
    await expect(page.getByRole('alert')).toContainText('took too long', { timeout: 30_000 });
  });

  test('a late response for an old page never replaces the current page', async ({ page }) => {
    await openApp(page, { hash: '#/log/ranking', scenario: 'out-of-order' });
    const table = page.getByTestId('ranking-table');
    await expect(table).toBeVisible({ timeout: 10_000 });
    // Request #2 (page 2) is fast, #3 (page 3) slow, #4 refetch of page 2 fast.
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByText('Page 2 of 4')).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.getByRole('button', { name: 'Previous page' }).click();
    await expect(page.getByText('Page 2 of 4')).toBeVisible();
    await page.waitForTimeout(2000);
    await expect(page.getByText('Page 2 of 4')).toBeVisible();
    await expect(table.locator('tbody tr').first()).toContainText('06');
  });
});
