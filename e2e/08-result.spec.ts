import { expect, hold, openApp, runToEnd, startBattle, test } from './support';

test('shows the result and keeps it after a refresh', async ({ page }) => {
  await openApp(page, { options: { sessionSeconds: 60, spawnIntervalSeconds: 10 } });
  await startBattle(page);
  await hold(page, ['Space'], 500);
  await runToEnd(page);

  await expect(page).toHaveURL(/#\/result$/);
  const score = await page.getByTestId('result-score').textContent();
  const meta = await page.getByTestId('result-meta').textContent();
  await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'saved');

  await page.reload();
  await expect(page.getByTestId('result-score')).toHaveText(score ?? '');
  await expect(page.getByTestId('result-meta')).toHaveText(meta ?? '');
  await expect(page.getByTestId('record-status')).toHaveAttribute('data-status', 'saved');
  await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible();
});
