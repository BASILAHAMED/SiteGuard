import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const GALLERY_DIR = path.resolve('test-results/demo-gallery');

test.describe('Full Demo Script End-to-End Smoke Replay', () => {
  test('replays complete 3-minute live demo end-to-end and captures sanity gallery screenshots', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    fs.mkdirSync(GALLERY_DIR, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    const resetRes = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(resetRes.ok()).toBeTruthy();

    // Step 1: Open /worker -> Green baseline + predictive 30-min forecast for W-101
    await page.goto('/worker');
    await expect(page.getByText('GREEN · NOMINAL')).toBeVisible();
    await expect(page.getByText(/Amber ETA:/i)).toBeVisible();
    await page.screenshot({ path: path.join(GALLERY_DIR, '01-worker-green-baseline.png'), fullPage: true });

    // Step 2: Advance simulated clock twice (+6m then +3m) until predicted Amber crossing materializes
    const step1 = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/sim-step'));
    await page.getByRole('button', { name: '+6 min Step' }).click();
    await step1;

    await expect(page.getByText(/AMBER · REST IN SHADE|RED · STOP WORK/)).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: path.join(GALLERY_DIR, '02-worker-crossing-amber.png'),
      fullPage: true,
    });

    // Step 3: Switch language (Urdu RTL) and press Need Help SOS check-in
    const langResp = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/language'));
    await page.getByRole('button', { name: 'اردو' }).click();
    await langResp;

    const helpResp = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/checkin'));
    await page.getByRole('button', { name: 'Need Help' }).click();
    await helpResp;
    await expect(page.getByRole('status')).toContainText('SOS ACTIVE');
    await page.screenshot({
      path: path.join(GALLERY_DIR, '03-worker-multilingual-sos.png'),
      fullPage: true,
    });

    // Step 4: Navigate to /supervisor -> verify privacy-safe tier grid + SOS alert + Order 15m Break
    await page.goto('/supervisor');
    await expect(page.getByText('WORKER REQUESTED HELP')).toBeVisible();
    await page.screenshot({
      path: path.join(GALLERY_DIR, '04-supervisor-crew-grid.png'),
      fullPage: true,
    });

    const actionResp = page.waitForResponse((r) => r.url().includes('/api/supervisor/action'));
    await page.getByRole('button', { name: 'Order 15m Break' }).first().click();
    await actionResp;
    await page.screenshot({
      path: path.join(GALLERY_DIR, '05-supervisor-break-dispatched.png'),
      fullPage: true,
    });

    // Step 5: Return to /worker -> open Simulator drawer -> inject Disconnect BLE fault -> verify env-only degradation -> clear fault
    await page.goto('/worker');
    await page.getByRole('button', { name: /Developer \/ BLE Simulator/i }).click();
    const faultResp = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/fault'));
    await page.getByRole('button', { name: 'Disconnect BLE' }).click();
    await faultResp;
    await expect(page.getByText('DEGRADED · ENVIRONMENT-ONLY MODE:')).toBeVisible();
    await expect(page.getByText('PSI N/A (Env-Only)')).toBeVisible();
    await page.screenshot({
      path: path.join(GALLERY_DIR, '06-worker-fault-degraded.png'),
      fullPage: true,
    });

    const clearResp = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/fault'));
    await page.getByRole('button', { name: 'Clear All Faults' }).click();
    await clearResp;
    await expect(page.getByText('DEGRADED · ENVIRONMENT-ONLY MODE:')).toHaveCount(0);
    await expect(page.getByText(/Composite \d+\.\d\/10 · PSI \d+\.\d/)).toBeVisible();
    await page.screenshot({
      path: path.join(GALLERY_DIR, '07-worker-fault-cleared.png'),
      fullPage: true,
    });

    // Step 6: Generate UAE Midday Break Compliance Report + Prospective Forecast Validation
    await page.goto('/compliance');
    await expect(page.getByText('12:30–15:00 GST').first()).toBeVisible();
    await page.screenshot({
      path: path.join(GALLERY_DIR, '08-compliance-report.png'),
      fullPage: true,
    });

    await page.goto('/forecast-validation');
    await expect(page.getByRole('heading', { name: /Ablation Comparison/i })).toBeVisible();
    await page.screenshot({
      path: path.join(GALLERY_DIR, '09-forecast-validation.png'),
      fullPage: true,
    });
  });
});
