import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'test-results/watch-sim';

async function shot(page: Page, name: string) {
  await page.waitForTimeout(450); // let spring transitions settle
  await page.getByTestId('watch-shell').screenshot({ path: `${SHOTS}/${name}.png` });
}

async function swipe(page: Page, dx: number, dy: number, from?: { fx: number; fy: number }) {
  const box = await page.getByTestId('watch-gesture-layer').boundingBox();
  if (!box) throw new Error('no gesture layer');
  const x = box.x + box.width * (from?.fx ?? 0.5);
  const y = box.y + box.height * (from?.fy ?? 0.5);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

/** Push a BLE frame straight to the API (as a real band would) — the watch
 * must pick it up through live polling, with no UI click. */
async function pushFrameViaApi(page: Page, hrBpm: number, skinTempC: number, exertionIndex: number) {
  const res = await page.request.post('/api/ble/telemetry', {
    data: {
      deviceId: 'BLE-BAND-101',
      workerId: 'W-101',
      timestamp: new Date().toISOString(),
      hrBpm,
      skinTempC,
      exertionIndex,
      batteryPct: 86,
      rssiDbm: -60,
      gpsFix: true,
      signalQuality: 0.98,
      simulatedClockMin: 15,
    },
  });
  expect(res.ok()).toBeTruthy();
}

async function openDrawer(page: Page) {
  const t = page.getByRole('button', { name: /Developer \/ BLE Simulator/i });
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
}

async function preset(page: Page, name: 'Normal' | 'Heat Ramp' | 'Critical') {
  await openDrawer(page);
  const resp = page.waitForResponse((r) => r.url().includes('/api/ble/telemetry'));
  await page.getByRole('button', { name, exact: true }).click();
  await resp;
}

test.describe('Interactive smartwatch simulator', () => {
  test.beforeEach(async ({ request, page }) => {
    const res = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(res.ok()).toBeTruthy();
    await page.goto('/worker');
    await expect(page.getByTestId('watchface-active')).toBeVisible();
    // The default scenario projects an Amber crossing, so a pre-warning banner
    // greets the user on load — verify it, then flick it away for clean shots.
    const pre = page.locator('[data-testid="watch-alert-banner"][data-kind="prewarn-amber"]');
    await expect(pre).toBeVisible({ timeout: 4000 });
    await expect(pre).toContainText(/Amber in ~\d+ min/);
    await pre.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(pre).toHaveCount(0);
  });

  test('crown press toggles launcher, crown wheel scrolls it, Escape returns home', async ({ page }) => {
    const watch = page.getByTestId('smartwatch');
    await shot(page, '01-green-face');

    await page.getByTestId('watch-crown').click();
    await expect(watch).toHaveAttribute('data-view', 'launcher');
    const launcher = page.getByTestId('watch-launcher');
    await expect(launcher).toBeVisible();
    await shot(page, '02-launcher');

    const crown = await page.getByTestId('watch-crown').boundingBox();
    await page.mouse.move(crown!.x + crown!.width / 2, crown!.y + crown!.height / 2);
    await page.mouse.wheel(0, 320);
    await expect.poll(() => launcher.evaluate((el) => el.scrollTop)).toBeGreaterThan(40);

    await page.getByTestId('watch-crown').click();
    await expect(watch).toHaveAttribute('data-view', 'home');
    await expect(page.getByTestId('watchface-active')).toBeVisible();
  });

  test('swipe left/right pages Face → Vitals → Forecast → Break and back', async ({ page }) => {
    const watch = page.getByTestId('smartwatch');
    await swipe(page, -140, 0);
    await expect(watch).toHaveAttribute('data-page', '1');
    await expect(page.getByTestId('watch-vitals')).toBeVisible();
    await expect(page.getByTestId('vitals-hr')).toHaveText(/^\d+$/);
    await shot(page, '03-vitals');

    await swipe(page, -140, 0);
    await expect(page.getByTestId('watch-forecast')).toBeVisible();
    await shot(page, '04-forecast');

    await swipe(page, -140, 0);
    await expect(page.getByTestId('watch-break')).toBeVisible();
    await page.getByTestId('start-break').click();
    await shot(page, '05-break');

    await swipe(page, 140, 0);
    await swipe(page, 140, 0);
    await swipe(page, 140, 0);
    await expect(watch).toHaveAttribute('data-page', '0');
    await expect(page.getByTestId('watchface-active')).toBeVisible();
  });

  test('swipe down opens notifications, swipe up opens control centre', async ({ page }) => {
    const watch = page.getByTestId('smartwatch');
    await swipe(page, 0, 150, { fx: 0.5, fy: 0.42 });
    await expect(watch).toHaveAttribute('data-view', 'alerts');
    await expect(page.getByTestId('watch-notifications')).toBeVisible();
    await swipe(page, 0, -150, { fx: 0.5, fy: 0.7 });
    await expect(watch).toHaveAttribute('data-view', 'home');

    await swipe(page, 0, -150, { fx: 0.5, fy: 0.7 });
    await expect(watch).toHaveAttribute('data-view', 'control');
    await expect(page.getByTestId('cc-haptics')).toHaveAttribute('aria-pressed', 'true');
    await shot(page, '06-control-centre');
  });

  test('side button: tap opens quick panel; hold starts SOS countdown that Cancel aborts', async ({ page }) => {
    const watch = page.getByTestId('smartwatch');
    let checkins = 0;
    page.on('request', (r) => {
      if (r.url().includes('/checkin')) checkins += 1;
    });

    await page.getByTestId('watch-sidebutton').click();
    await expect(page.getByTestId('watch-quick-panel')).toBeVisible();
    await page.getByTestId('watch-sidebutton').click();
    await expect(watch).toHaveAttribute('data-view', 'home');

    const btn = await page.getByTestId('watch-sidebutton').boundingBox();
    await page.mouse.move(btn!.x + btn!.width / 2, btn!.y + btn!.height / 2);
    await page.mouse.down();
    await expect(page.getByTestId('sos-hold-hint')).toBeVisible();
    await page.waitForTimeout(1700);
    await page.mouse.up();
    await expect(page.getByTestId('watch-sos-countdown')).toBeVisible();
    await shot(page, '07-sos-countdown');
    await page.getByTestId('sos-cancel').click();
    await expect(watch).toHaveAttribute('data-view', 'home');
    await page.waitForTimeout(3300);
    expect(checkins).toBe(0);
  });

  test('SOS countdown completing sends Need Help and shows SOS-sent screen', async ({ page }) => {
    await page.getByTestId('watch-crown').click();
    await page.getByTestId('launcher-sos').click();
    await expect(page.getByTestId('watch-sos-countdown')).toBeVisible();
    const resp = page.waitForResponse((r) => r.url().includes('/checkin'));
    await resp;
    await expect(page.getByTestId('watch-sos-active')).toBeVisible();
    await expect(page.getByRole('status')).toContainText('SOS ACTIVE');
    await shot(page, '08-sos-sent');
    await page.getByTestId('sos-safe').click();
    await expect(page.getByRole('status')).toContainText('CHECK-IN CONFIRMED');
  });

  test('live warnings: Amber banner via polling, then Red takeover needing acknowledgement, then recovery', async ({ page }) => {
    await pushFrameViaApi(page, 115, 35.0, 5.5); // engine → Amber, Red projected
    await expect(page.locator('[data-testid="watch-alert-banner"][data-kind="amber"]')).toBeVisible({
      timeout: 6000,
    });
    await expect(page.getByText('AMBER · REST IN SHADE')).toBeVisible();
    await shot(page, '09-amber-banner');

    await preset(page, 'Critical');
    const red = page.getByTestId('watch-alert-red');
    await expect(red).toBeVisible({ timeout: 4000 });
    await expect(red).toContainText('STOP WORK');
    await shot(page, '10-red-takeover');

    // Red does not auto-dismiss and blocks the crown
    await page.waitForTimeout(1500);
    await page.getByTestId('watch-crown').click();
    await expect(red).toBeVisible();

    await page.getByTestId('alert-ack').click();
    await expect(red).toHaveCount(0);
    await expect(page.getByTestId('watch-edge-glow')).toHaveAttribute('data-tone', 'red');
    await shot(page, '11-red-acknowledged');

    const cool = page.waitForResponse((r) => r.url().includes('/sim-step'));
    await page.getByRole('button', { name: 'Reset Cool' }).click();
    await cool;
    // Cooling from Red lands in Amber first (engine's own trend) → recovery notification.
    await expect(page.getByText('AMBER · REST IN SHADE')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="watch-alert-banner"][data-kind="recovery"]')).toBeVisible();
    await expect(page.getByTestId('watch-edge-glow')).toHaveAttribute('data-tone', 'amber');
    await shot(page, '11b-recovery');

    // Every alert landed in the notification centre
    await page.keyboard.press('Escape');
    await page.getByTestId('smartwatch').focus();
    await page.keyboard.press('n');
    await expect(page.getByTestId('notification-item').first()).toBeVisible();
    expect(await page.getByTestId('notification-item').count()).toBeGreaterThanOrEqual(2);
  });

  test('fault injection greys the watch and raises a degraded notification with the API reason', async ({ page }) => {
    await openDrawer(page);
    const resp = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/fault'));
    await page.getByRole('button', { name: 'Disconnect BLE' }).click();
    await resp;
    await expect(page.getByTestId('watchface-active')).toHaveAttribute('data-fault-degraded', 'true');
    // Env-only fallback at 32.8 °C WBGT scores Red — the conservative takeover comes first.
    const red = page.getByTestId('watch-alert-red');
    await expect(red).toBeVisible({ timeout: 4000 });
    await page.getByTestId('alert-ack').click();
    const banner = page.locator('[data-testid="watch-alert-banner"][data-kind="fault-on"]');
    await expect(banner).toBeVisible({ timeout: 4000 });
    await expect(banner).toContainText('BLE link disconnected');
    await shot(page, '12-degraded');
  });

  test('insufficient trend data: no ghost needle and no ETA anywhere on the watch', async ({ page }) => {
    await page.route('**/api/worker/W-101/state', async (route) => {
      const json = await (await route.fetch()).json();
      json.state.forecast = {
        status: 'insufficient_trend_data',
        reason: 'Insufficient clean trend window (2/4 clean samples collected).',
        cleanWindowSamples: 2,
        windowMinutes: 3,
        psiNow: 3.6,
        psi15: null,
        psi30: null,
        predictedTier15: null,
        predictedTier30: null,
        projectedAmberCrossingMin: null,
        projectedRedCrossingMin: null,
        slopePerMin: null,
        modelLabel: 'Weighted Damped Trend + Residual CI',
      };
      await route.fulfill({ json });
    });
    await page.goto('/worker');
    await expect(page.getByTestId('watchface-active')).toBeVisible();
    await expect(page.getByTestId('ghost-needle')).toHaveCount(0);
    await swipe(page, -140, 0);
    await swipe(page, -140, 0);
    const fc = page.getByTestId('watch-forecast');
    await expect(fc).toContainText('Collecting trend data');
    await expect(page.getByTestId('forecast-ci-band')).toHaveCount(0);
    const text = await page.getByTestId('smartwatch').innerText();
    expect(text).not.toMatch(/(?:Amber|Red)\s+(?:in\s+)?~?\d+\s*min/i);
  });

  test('Urdu alerts render right-to-left on the watch', async ({ page }) => {
    const watch = page.getByTestId('smartwatch');
    await watch.focus();
    await page.keyboard.press('c');
    const resp = page.waitForResponse((r) => r.url().includes('/language'));
    await page.getByTestId('cc-lang-ur').click();
    await resp;
    await page.keyboard.press('Escape');
    await pushFrameViaApi(page, 115, 35.0, 5.5);
    const banner = page.locator('[data-testid="watch-alert-banner"][data-kind="amber"]');
    await expect(banner).toBeVisible({ timeout: 6000 });
    await expect(banner.locator('p[dir="rtl"]')).toHaveCount(1);
    await shot(page, '13-urdu-rtl');
  });

  test('keyboard-only: Enter/arrows/Escape drive the watch; long-press face opens face picker', async ({ page }) => {
    const watch = page.getByTestId('smartwatch');
    await watch.focus();
    await page.keyboard.press('Enter');
    await expect(watch).toHaveAttribute('data-view', 'launcher');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.getByTestId('watch-launcher').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(watch).toHaveAttribute('data-view', 'home');
    await page.keyboard.press('ArrowRight');
    await expect(watch).toHaveAttribute('data-page', '1');
    await page.keyboard.press('ArrowLeft');
    await expect(watch).toHaveAttribute('data-page', '0');

    // Long-press on the dial (not on a button)
    const box = await page.getByTestId('watch-gesture-layer').boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height * 0.55);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await expect(page.getByTestId('watch-face-picker')).toBeVisible();
    await swipe(page, -140, 0);
    await shot(page, '14-face-picker');
    await page.getByTestId('face-option-modular').click();
    await expect(page.getByTestId('watch-face-picker')).toHaveCount(0);
    await expect(page.getByTestId('watchface-modular')).toBeVisible();
    await expect(page.getByTestId('smartwatch')).toHaveAttribute('data-face', 'modular');
    await shot(page, '15-modular-face');
  });

  test('AOD: dims to the reduced-pixel face and a tap on the screen wakes it', async ({ page }) => {
    await page.getByRole('button', { name: 'Simulate AOD' }).click();
    await expect(page.getByTestId('watchface-aod')).toBeVisible();
    await shot(page, '16-aod');
    const box = await page.getByTestId('watch-gesture-layer').boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height * 0.4);
    await expect(page.getByTestId('watchface-active')).toBeVisible();
  });
});
