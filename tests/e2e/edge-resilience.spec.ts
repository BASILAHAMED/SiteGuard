import { expect, test } from '@playwright/test';

test.describe('Real-Time Abu Dhabi Feed & Gemma 4 Edge AI Offline Resilience', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(res.ok()).toBeTruthy();
  });

  test('streams Live Abu Dhabi Feed, fails over cleanly to Gemma 4 Edge Offline Mode on button & browser offline, and auto-recovers', async ({
    page,
    request,
  }) => {
    // 1. Open /worker right after reset -> starts on Historical Calibration
    await page.goto('/worker');
    const indicator = page.getByTestId('feed-mode-indicator');
    await expect(indicator).toHaveText('Historical Calibration');

    // 2. Verify backend live failover endpoint directly
    const offlineApi = await request.get('/api/environment/live?simulateOffline=true');
    expect(offlineApi.ok()).toBeTruthy();
    const offlineJson = (await offlineApi.json()) as {
      current: { feedStatus: string; edgeOfflineActive: boolean; lat: number; lon: number; wbgtC: number };
    };
    expect(offlineJson.current.feedStatus).toBe('gemma4_edge_offline_mode');
    expect(offlineJson.current.edgeOfflineActive).toBe(true);
    expect(offlineJson.current.lat).toBeCloseTo(24.4539, 3);
    expect(offlineJson.current.lon).toBeCloseTo(54.3773, 3);
    expect(Number.isFinite(offlineJson.current.wbgtC)).toBe(true);

    // 3. Switch to Live Abu Dhabi Feed -> wait for POST /api/environment/mode
    const liveSwitchResp = page.waitForResponse(
      (r) => r.url().includes('/api/environment/mode') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Live Abu Dhabi', exact: true }).click();
    await liveSwitchResp;

    // Even if test runner is offline upstream, server never fails; accept live or immediate edge mode,
    // and verify coordinates & watch face remain healthy
    const statusAfterLive = await indicator.innerText();
    expect(['Live Abu Dhabi Feed', 'Gemma 4 Edge Offline Mode']).toContain(statusAfterLive);
    await expect(page.getByText(/24\.45°N, 54\.38°E/)).toBeVisible();
    await expect(page.getByTestId('watchface-active')).toBeVisible();

    // 4. Click "Edge Offline" demo failover toggle -> transitions seamlessly to Gemma 4 Edge Offline Mode
    const edgeToggleResp = page.waitForResponse(
      (r) => r.url().includes('/api/environment/mode') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Edge Offline', exact: true }).click();
    await edgeToggleResp;

    await expect(indicator).toHaveText('Gemma 4 Edge Offline Mode');
    await expect(page.getByText('Gemma 4 Edge Local Inference', { exact: true })).toBeVisible();

    // Verify continuous local worker safety predictions still work seamlessly without error banners
    await expect(page.getByText(/Failed to load worker telemetry/i)).toHaveCount(0);
    await page.getByRole('button', { name: '+3 min Step' }).click();
    await expect(page.getByTestId('watchface-active')).toBeVisible();

    // 5. Switch back to Live Abu Dhabi (clears simulateOffline)
    const restoreResp = page.waitForResponse(
      (r) => r.url().includes('/api/environment/mode') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Live Abu Dhabi', exact: true }).click();
    await restoreResp;
    const restoredText = await indicator.innerText();
    expect(['Live Abu Dhabi Feed', 'Gemma 4 Edge Offline Mode']).toContain(restoredText);

    // 6. Simulate real browser network drop -> must switch UI to Gemma 4 Edge Offline Mode and keep running without errors
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(indicator).toHaveText('Gemma 4 Edge Offline Mode');
    await expect(page.getByText('Gemma 4 Edge Local Inference', { exact: true })).toBeVisible();

    // Interactive sim step while completely offline uses in-browser Gemma 4 Edge continuity
    await page.getByRole('button', { name: '+3 min Step' }).click();
    await expect(page.getByTestId('watchface-active')).toBeVisible();
    await expect(page.getByText(/Failed to load worker telemetry/i)).toHaveCount(0);

    // 7. Restore browser network -> online recovery triggers live resync cleanly
    await page.context().setOffline(false);
    const onlineRecoverResp = page.waitForResponse(
      (r) => r.url().includes('/api/environment/live') && r.request().method() === 'GET'
    );
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await onlineRecoverResp;
    const finalStatus = await indicator.innerText();
    expect(['Live Abu Dhabi Feed', 'Gemma 4 Edge Offline Mode']).toContain(finalStatus);
  });
});
