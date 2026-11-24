import { advance, expect, openApp, snapshot, startBattle, test } from './support';

test.describe('Responsive arena', () => {
  test('resizing during a match rescales the canvas without changing the rules', async ({ page }) => {
    await openApp(page, { options: { sessionSeconds: 120, spawnIntervalSeconds: 10 } });
    await startBattle(page);
    await advance(page, 500);
    const before = await snapshot(page);
    const canvas = page.getByTestId('game-canvas');
    const initial = await canvas.boundingBox();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('viewport size unknown');
    await page.setViewportSize({ width: Math.round(viewport.width * 0.7), height: Math.round(viewport.height * 0.8) });
    await expect.poll(async () => (await canvas.boundingBox())?.width).toBeLessThan(initial?.width ?? 0);

    const after = await snapshot(page);
    expect(after.player).toEqual(before.player);
    expect(after.timeLeft).toBe(before.timeLeft);

    // HUD and on-screen controls stay inside the viewport.
    const size = page.viewportSize();
    for (const testId of ['hud-health', 'hud-score', 'hud-time', 'touch-move', 'touch-fire']) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, testId).not.toBeNull();
      if (!box || !size) continue;
      expect(box.x, testId).toBeGreaterThanOrEqual(0);
      expect(box.y, testId).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, testId).toBeLessThanOrEqual(size.width + 0.5);
      expect(box.y + box.height, testId).toBeLessThanOrEqual(size.height + 0.5);
    }

    // The rules keep running in logical coordinates.
    await page.keyboard.down('KeyW');
    await advance(page, 600);
    await page.keyboard.up('KeyW');
    expect((await snapshot(page)).player.y).toBeLessThan(before.player.y);
  });
});
