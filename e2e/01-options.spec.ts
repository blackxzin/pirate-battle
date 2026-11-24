import { expect, openApp, snapshot, startBattle, test } from './support';

test.describe('Options', () => {
  test('navigates, validates input and persists after refresh', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();

    const session = page.getByLabel('Game session time', { exact: true });
    const spawn = page.getByLabel('Enemy spawn time', { exact: true });

    await session.fill('500');
    await expect(session).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toContainText('between 60 and 180');

    await session.fill('95');
    await expect(page.getByRole('alert')).toContainText('steps of 10');

    await session.fill('90');
    await expect(session).toHaveAttribute('aria-invalid', 'false');

    await page.getByRole('button', { name: 'Increase enemy spawn time' }).click();
    await expect(spawn).toHaveValue('3.5');
    await spawn.fill('0');
    await expect(page.getByRole('alert')).toContainText('between 1 and 10');
    await spawn.fill('2');
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Game session time', { exact: true })).toHaveValue('90');
    await expect(page.getByLabel('Enemy spawn time', { exact: true })).toHaveValue('2');

    await page.getByRole('button', { name: 'Main Menu' }).click();
    await startBattle(page);
    const state = await snapshot(page);
    expect(state.timeLeft).toBe(90);
  });

  test('invalid values are never persisted', async ({ page }) => {
    await openApp(page, { hash: '#/options' });
    await page.getByLabel('Game session time', { exact: true }).fill('abc');
    await expect(page.getByRole('alert')).toContainText('must be a number');
    await page.reload();
    await expect(page.getByLabel('Game session time', { exact: true })).toHaveValue('120');
  });

  test('changes made during a match apply only to the next match; typing in forms is not game input', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 3 } });
    await startBattle(page);
    const before = await snapshot(page);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Options' }).click();
    const session = page.getByLabel('Game session time', { exact: true });
    // Game keys typed into a form reach the form, never the ship.
    await session.fill('');
    await session.pressSequentially('w e q');
    await expect(session).toHaveValue('w e q');
    await session.fill('60');
    await expect(page.getByRole('status').filter({ hasText: 'apply to your next battle' })).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Resume' }).click();
    const current = await snapshot(page);
    expect(current.timeLeft).toBe(before.timeLeft);
    expect(current.player).toEqual(before.player);
    expect(current.projectiles).toBe(0);

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await startBattle(page);
    expect((await snapshot(page)).timeLeft).toBe(60);
  });

  test('menus are keyboard operable', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Options' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
  });
});
