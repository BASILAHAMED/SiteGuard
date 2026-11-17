import { expect, test } from '@playwright/test';

test.describe('Hardware Fault Injection & Graceful Degradation', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(res.ok()).toBeTruthy();
  });

  test('BLE disconnect, low battery, and sensor noise trigger env-only fallback scoring and clear cleanly', async ({
    page,
  }) => {
    await page.goto('/worker');
    await page.getByRole('button', { name: /Developer \/ BLE Simulator/i }).click();

    const physFaultButtons = ['Disconnect BLE', 'Battery <10%', 'Sensor Noise'] as const;

    for (const label of physFaultButtons) {
      await expect(page.getByText(/Composite \d+\.\d\/10 · PSI \d+\.\d/)).toBeVisible();
      await expect(page.getByText('DEGRADED · ENVIRONMENT-ONLY MODE:')).toHaveCount(0);

      const faultResp = page.waitForResponse(
        (r) => r.url().includes('/api/worker/W-101/fault') && r.request().method() === 'POST'
      );
      await page.getByRole('button', { name: label }).click();
      await faultResp;

      await expect(page.getByText('DEGRADED · ENVIRONMENT-ONLY MODE:')).toBeVisible({ timeout: 3000 });
      await expect(page.getByText('PSI N/A (Env-Only)')).toBeVisible();

      const clearResp = page.waitForResponse(
        (r) => r.url().includes('/api/worker/W-101/fault') && r.request().method() === 'POST'
      );
      await page.getByRole('button', { name: 'Clear All Faults' }).click();
      await clearResp;

      await expect(page.getByText('DEGRADED · ENVIRONMENT-ONLY MODE:')).toHaveCount(0);
      await expect(page.getByText(/Composite \d+\.\d\/10 · PSI \d+\.\d/)).toBeVisible();
      // Post-fault clean window reset must refuse fabricated trajectory until 4 clean readings arrive
      await expect(page.getByText('Insufficient Trend Data', { exact: true })).toBeVisible();
    }
  });

  test('GPS Loss triggers visible degraded GPS notice, logs supervisor alert, and restores cleanly on clear', async ({
    page,
  }) => {
    await page.goto('/worker');
    await page.getByRole('button', { name: /Developer \/ BLE Simulator/i }).click();

    const gpsResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/fault') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'GPS Loss' }).click();
    await gpsResp;

    await expect(page.getByText('DEGRADED · GPS SIGNAL LOST:')).toBeVisible({ timeout: 3000 });

    await page.goto('/supervisor');
    await expect(page.getByText(/Wearable GPS fix lost/i).first()).toBeVisible();

    await page.goto('/worker');
    await page.getByRole('button', { name: /Developer \/ BLE Simulator/i }).click();
    const clearResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/fault') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Clear All Faults' }).click();
    await clearResp;

    await expect(page.getByText('DEGRADED · GPS SIGNAL LOST:')).toHaveCount(0);
    await expect(page.getByText(/Composite \d+\.\d\/10 · PSI \d+\.\d/)).toBeVisible();
  });
});
