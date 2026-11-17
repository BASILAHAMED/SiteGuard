import { expect, test } from '@playwright/test';

test.describe('Supervisor Custom Temperature Thresholds & Multilingual Alert Rules', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(res.ok()).toBeTruthy();
  });

  test('converts thresholds across °C/°F, validates ordering, and propagates custom multilingual alerts to /worker', async ({
    page,
  }) => {
    await page.goto('/supervisor');
    await expect(
      page.getByRole('heading', { name: /Supervisor Temperature Thresholds/i })
    ).toBeVisible();

    const amberInput = page.locator('#amber-threshold-input');
    const redInput = page.locator('#red-threshold-input');

    await expect(amberInput).toHaveValue('26.0');
    await expect(redInput).toHaveValue('29.0');

    // Toggle global temperature unit to Fahrenheit and confirm threshold inputs convert cleanly
    await page
      .getByRole('switch', { name: /Toggle temperature unit between Celsius and Fahrenheit/i })
      .click();
    await expect(amberInput).toHaveValue('78.8');
    await expect(redInput).toHaveValue('84.2');

    // Toggle back to Celsius
    await page
      .getByRole('switch', { name: /Toggle temperature unit between Celsius and Fahrenheit/i })
      .click();
    await expect(amberInput).toHaveValue('26.0');

    // Validate Amber >= Red guard
    await amberInput.fill('36.0');
    await redInput.fill('35.0');
    await page.getByRole('button', { name: /Save & Activate Thresholds/i }).click();
    await expect(page.getByRole('alert')).toContainText(/lower than Red Stop-Work/i);

    // Configure active thresholds that trigger Red on 35.0°C site WBGT + custom Hindi stop-work alert
    await amberInput.fill('33.5');
    await redInput.fill('34.5');

    await page.getByRole('tab', { name: 'हिन्दी' }).click();
    const customHindiHeadline = 'कस्टम चेतावनी — तुरंत छाया में जाएं';
    await page.locator('#custom-red-headline').fill(customHindiHeadline);

    const saveResp = page.waitForResponse(
      (r) => r.url().includes('/api/supervisor/alert-policy') && r.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: /Save & Activate Thresholds/i }).click();
    await saveResp;
    await expect(page.getByRole('status')).toContainText(/Custom threshold rules active/i);

    // Cross-page check: /worker W-101 elevates to RED and displays supervisor's custom Hindi message
    await page.goto('/worker');
    await expect(page.getByText('RED · STOP WORK')).toBeVisible();

    const hiResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/language') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'हिन्दी' }).click();
    await hiResp;
    await expect(page.getByText(customHindiHeadline)).toBeVisible();

    // Reset Defaults restores standard ACGIH behavior (W-101 returns to Green)
    await page.goto('/supervisor');
    const resetResp = page.waitForResponse(
      (r) => r.url().includes('/api/supervisor/alert-policy') && r.request().method() === 'PUT'
    );
    await page.getByRole('button', { name: 'Reset Defaults' }).click();
    await resetResp;

    await page.goto('/worker');
    await expect(page.getByText('GREEN · NOMINAL')).toBeVisible();
  });
});
