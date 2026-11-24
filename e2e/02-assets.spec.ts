import { expect, openApp, snapshot, test } from './support';

// MSW's service worker forwards every request, which hides asset requests from
// page.route(), and Pixi decodes atlas images in a Web Worker. These tests need
// no API, so the worker is blocked and the atlas descriptors (JSON) are routed.
test.use({ serviceWorkers: 'block' });

test.describe('Asset loading', () => {
  test('shows progress while the atlases download', async ({ page }) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/assets/tiles_sheet.json', async (route) => {
      await held;
      await route.continue();
    });
    await openApp(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    const progress = page.getByRole('progressbar', { name: 'Loading assets' });
    await expect(progress).toBeVisible();
    await expect(page.getByTestId('hud-score')).toHaveCount(0);

    release();
    await expect(page.getByTestId('hud-score')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });

  test('reports a failure and recovers with retry', async ({ page, consoleGuard }) => {
    consoleGuard.allowNetworkErrors();
    let shouldFail = true;
    await page.route('**/assets/ships_sheet.json', (route) => (shouldFail ? route.abort() : route.continue()));
    await openApp(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText('Could not load the game assets');
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByTestId('hud-score')).toHaveCount(0);

    shouldFail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await page.waitForFunction(() => window.__PIRATE_BATTLE__ !== undefined);
    await expect(page.getByTestId('hud-score')).toBeVisible();
    expect((await snapshot(page)).status).toBe('running');
  });

  test('a battle chunk that fails to download is reported and a reload recovers', async ({ page, consoleGuard }) => {
    consoleGuard.allowNetworkErrors();
    consoleGuard.allow(/Screen failed to render|dynamically imported module|error occurred in/i);
    let shouldFail = true;
    await page.route('**/assets/GameScreen-*.js', (route) => (shouldFail ? route.abort() : route.continue()));
    await openApp(page);
    await page.getByRole('button', { name: 'Play', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'The battle could not open' })).toBeVisible();
    shouldFail = false;
    await page.getByRole('button', { name: 'Reload Game' }).click();
    await expect(page).toHaveURL(/#\/$/);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.waitForFunction(() => window.__PIRATE_BATTLE__ !== undefined);
    await expect(page.getByTestId('hud-score')).toBeVisible();
  });
});
