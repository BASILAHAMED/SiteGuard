import { expect, test } from '@playwright/test';

test.describe('Circular Watch Face, AOD Mode, Boundary Enforcement & Voice Incident Recording', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(res.ok()).toBeTruthy();
  });

  test('renders WatchFaceGauge as primary with collapsed simulator drawer, 5 history ticks, and desaturated fault state', async ({
    page,
  }) => {
    await page.goto('/worker');

    // Primary circular watch face is visible immediately
    const activeWatch = page.getByTestId('watchface-active');
    await expect(activeWatch).toBeVisible();
    await expect(activeWatch).toHaveAttribute('data-fault-degraded', 'false');
    await expect(page.getByTestId('history-tick')).toHaveCount(5);
    await expect(page.getByTestId('ghost-needle')).toHaveCount(1);

    // Simulator drawer must start collapsed
    const drawerToggle = page.getByRole('button', { name: /Developer \/ BLE Simulator/i });
    await expect(drawerToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#hr-slider')).toHaveCount(0);

    // Expand drawer, inject BLE fault, confirm greyscale degraded dial + API degradedReason
    await drawerToggle.click();
    await expect(drawerToggle).toHaveAttribute('aria-expanded', 'true');

    const faultResp = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/fault'));
    await page.getByRole('button', { name: 'Disconnect BLE' }).click();
    await faultResp;

    await expect(activeWatch).toHaveAttribute('data-fault-degraded', 'true');
    await expect(page.getByTestId('watchface-bottom-label')).toContainText('BLE link disconnected');
    await expect(page.getByTestId('arc-green')).toHaveAttribute('stroke', '#475569');
  });

  test('renders NO ghost-needle DOM element and NO fabricated ETA when forecast.status is insufficient_trend_data', async ({
    page,
  }) => {
    await page.route('**/api/worker/W-101/state', async (route) => {
      const realResp = await route.fetch();
      const json = await realResp.json();
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
      json.state.alertTranslations.en.proactiveForecastNote =
        'Insufficient trend data for forecast window — follow standard scheduled breaks.';
      await route.fulfill({ json });
    });

    await page.goto('/worker');
    await expect(page.getByTestId('watchface-active')).toBeVisible();

    // Critical DOM boundary: ghost-needle MUST NOT exist at all in DOM
    await expect(page.getByTestId('ghost-needle')).toHaveCount(0);
    await expect(page.getByTestId('watchface-forecast-subline')).toContainText(
      /collecting trend data/i
    );
    await expect(page.getByText('Insufficient Trend Data', { exact: true })).toBeVisible();

    // Verify no fabricated ETA strings ("Amber in N min", "Red in N min") appear anywhere on page
    const bodyText = await page.locator('main').innerText();
    expect(bodyText).not.toMatch(/(?:Amber|Red)\s+(?:crossing\s+)?in\s+~?\d+\s*min/i);
  });

  test('Always-On Display (AOD) renders a genuinely simplified monochrome variant distinct from active mode', async ({
    page,
  }) => {
    await page.goto('/worker');
    const activeWatch = page.getByTestId('watchface-active');
    await expect(activeWatch).toBeVisible();

    const activeSvgChildCount = await activeWatch.locator('svg path, svg line, svg circle').count();
    const activeScreenshot = await activeWatch.screenshot();

    await page.getByRole('button', { name: 'Simulate AOD' }).click();
    const aodWatch = page.getByTestId('watchface-aod');
    await expect(aodWatch).toBeVisible();
    await expect(page.getByTestId('watchface-active')).toHaveCount(0);

    // AOD strips ghost needle & history ticks completely and simplifies tier to single letter G/A/R
    await expect(page.getByTestId('ghost-needle')).toHaveCount(0);
    await expect(page.getByTestId('history-tick')).toHaveCount(0);
    await expect(aodWatch.locator('svg text').nth(1)).toHaveText(/^[GAR]$/);

    const aodSvgChildCount = await aodWatch.locator('svg path, svg line, svg circle').count();
    expect(aodSvgChildCount).toBeLessThan(activeSvgChildCount);

    const aodScreenshot = await aodWatch.screenshot();
    expect(Buffer.compare(activeScreenshot, aodScreenshot)).not.toBe(0);

    await page.getByRole('button', { name: 'Exit AOD' }).click();
    await expect(page.getByTestId('watchface-active')).toBeVisible();
  });

  test('captures microphone voice incident report via MediaRecorder and logs privacy-safe alert to /supervisor', async ({
    page,
  }) => {
    // Mock navigator.mediaDevices.getUserMedia & MediaRecorder in Chromium test context
    await page.addInitScript(() => {
      const fakeStream = { getTracks: () => [{ stop: () => {} }] };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => fakeStream,
        },
      });

      class MockMediaRecorder {
        state = 'inactive';
        mimeType = 'audio/webm';
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          if (this.ondataavailable) {
            this.ondataavailable({ data: new Blob(['mock-audio-bytes'], { type: 'audio/webm' }) });
          }
          if (this.onstop) {
            this.onstop();
          }
        }
      }
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder = MockMediaRecorder;
    });

    await page.route('**/api/worker/W-101/voice-report', async (route) => {
      const reqData = route.request().postDataJSON() as {
        audioBase64?: string;
        transcript?: string;
        severity?: string;
      };
      expect(reqData.audioBase64).toBeTruthy();
      expect(reqData.severity).toBe('High');
      const resp = await route.fetch();
      await route.fulfill({ response: resp });
    });

    await page.goto('/worker');
    // Raise Siri-style Voice Sheet over Watch Screen
    await page.getByTestId('open-voice-sheet-btn').click();
    await expect(page.getByTestId('watch-voice-sheet')).toBeVisible();

    const severitySelect = page.getByLabel('Incident Severity');
    await expect(severitySelect).toBeVisible();
    await expect(severitySelect).toHaveValue('Medium');
    await severitySelect.selectOption('High');
    await expect(severitySelect).toHaveValue('High');

    await page
      .getByLabel('Voice incident transcript or fallback note')
      .fill('Worker reporting dizziness near Zone A rebar deck.');

    await page.getByRole('button', { name: /Record Voice Incident/i }).click();
    await expect(page.getByRole('button', { name: /Stop & Transcribe/i })).toBeVisible();
    await expect(severitySelect).toBeDisabled();

    const voiceResp = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/voice-report'));
    await page.getByRole('button', { name: /Stop & Transcribe/i }).click();
    await voiceResp;

    await expect(page.getByTestId('voice-incident-logged')).toContainText('HIGH');
    await expect(page.getByTestId('voice-incident-logged')).toContainText(
      'Worker reporting dizziness near Zone A rebar deck.'
    );

    // Supervisor feed immediately displays the incident with selected severity and zero raw physiological vitals
    await page.goto('/supervisor');
    await expect(
      page.getByText(/Voice Incident \(EN · High\): "Worker reporting dizziness near Zone A rebar deck\."/i)
    ).toBeVisible();
  });

  test('AppCarousel nearest-to-center scroll focus tracks cards and auto-focuses Stop-Work Alert only when live API tier is Red', async ({
    page,
  }) => {
    await page.goto('/worker');
    await expect(page.getByTestId('apple-watch-shell')).toBeVisible();

    // Tap WatchFace center score -> opens AppCarousel
    await page.getByTestId('watchface-center-score').click();
    await expect(page.getByTestId('app-carousel-screen')).toBeVisible();

    // W-101 is Green -> Heat Risk Forecast centered by default, Stop-Work dimmed & "None active"
    const forecastCard = page.getByTestId('carousel-card-heat-risk-forecast');
    const stopWorkCard = page.getByTestId('carousel-card-stop-work-alert');
    const compositeCard = page.getByTestId('carousel-card-composite-strain');

    await expect(forecastCard).toHaveAttribute('data-focused', 'true');
    await expect(stopWorkCard).toHaveAttribute('data-focused', 'false');
    await expect(stopWorkCard).toContainText('None active');

    // Scroll carousel stack to top -> nearest-to-center shifts focus to Composite Strain
    const scrollBox = page.getByTestId('app-carousel-scroll');
    await scrollBox.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event('scroll'));
    });
    await expect(compositeCard).toHaveAttribute('data-focused', 'true');
    await expect(forecastCard).toHaveAttribute('data-focused', 'false');

    // Return to gauge and switch unit to W-104 (real Red critical strain from API)
    await page.getByRole('button', { name: /Back to Heat Watch Gauge/i }).click();
    const w104Resp = page.waitForResponse((r) => r.url().includes('/api/worker/W-104/state'));
    await page.locator('#worker-select').selectOption('W-104');
    await w104Resp;
    await expect(page.getByText('RED · STOP WORK')).toBeVisible();

    // Re-open carousel -> Stop-Work Alert auto-focuses (full opacity) with #fa114f value accent
    await page.getByTestId('watchface-center-score').click();
    await expect(stopWorkCard).toHaveAttribute('data-focused', 'true');
    await expect(stopWorkCard).toContainText('ACTIVE — STOP WORK');
    const valueEl = stopWorkCard.getByText('ACTIVE — STOP WORK');
    await expect(valueEl).toHaveCSS('color', 'rgb(250, 17, 79)');
  });

  test('Crown opens bubble App Grid, Notification Banner offers inline check-in, and 600ms Side-Button SOS slider rejects partial drags', async ({
    page,
  }) => {
    await page.goto('/worker');

    // 1. Digital Crown tap opens 6-bubble App Grid
    await page.getByTestId('digital-crown').click();
    const appGrid = page.getByTestId('watch-app-grid');
    await expect(appGrid).toBeVisible();
    await expect(appGrid.getByRole('button')).toHaveCount(6);
    await appGrid.getByRole('button', { name: 'Heat Gauge' }).click();
    await expect(page.getByTestId('watchface-active')).toBeVisible();

    // 2. Step clock on W-101 -> Amber escalation slides down Watch Notification Banner with inline actions
    const stepResp = page.waitForResponse((r) => r.url().includes('/api/worker/W-101/sim-step'));
    await page.getByRole('button', { name: '+6 min Step' }).click();
    await stepResp;

    const alertBanner = page.getByTestId('watch-alert-banner');
    await expect(alertBanner).toBeVisible();
    const inlineAckResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/checkin') && r.request().method() === 'POST'
    );
    await alertBanner.getByTestId('watch-banner-okay').click();
    await inlineAckResp;
    await expect(page.getByRole('status')).toContainText('CHECK-IN CONFIRMED · WORKER OKAY');

    // 3. Side-Button quick tap (<200ms) must NOT trigger SOS overlay
    const sideBtn = page.getByTestId('watch-side-button');
    await sideBtn.dispatchEvent('pointerdown');
    await page.waitForTimeout(150);
    await sideBtn.dispatchEvent('pointerup');
    await expect(page.getByTestId('watch-sos-overlay')).toHaveCount(0);

    // 4. Side-Button click-and-hold (600ms+) opens SOS Slide-to-Confirm overlay
    const box = await sideBtn.boundingBox();
    if (!box) throw new Error('Side button boundingBox unavailable');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(680);
    await page.mouse.up();
    await expect(page.getByTestId('watch-sos-overlay')).toBeVisible();

    // Track network checkin calls during partial drag -> MUST remain 0
    let sosCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/worker/W-101/checkin') && req.method() === 'POST') {
        sosCalls += 1;
      }
    });

    const track = page.getByTestId('sos-slider-track');
    const thumb = page.getByTestId('sos-slider-thumb');
    const trackBox = await track.boundingBox();
    const thumbBox = await thumb.boundingBox();
    if (!trackBox || !thumbBox) throw new Error('SOS slider boundingBox unavailable');

    const startX = thumbBox.x + thumbBox.width / 2;
    const y = thumbBox.y + thumbBox.height / 2;

    // Partial drag (~50% of track) + release -> MUST NOT fire Need Help; snaps back to 0
    await page.mouse.move(startX, y);
    await page.mouse.down();
    await page.mouse.move(trackBox.x + trackBox.width * 0.5, y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);

    expect(sosCalls).toBe(0);
    await expect(page.getByTestId('watch-sos-overlay')).toBeVisible();
    await expect(thumb).toHaveAttribute('aria-valuenow', '0');

    // Full drag to end of track + release -> triggers Need Help SOS check-in
    const freshThumbBox = await thumb.boundingBox();
    if (!freshThumbBox) throw new Error('Thumb boundingBox unavailable');
    const helpResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/checkin') && r.request().method() === 'POST'
    );
    await page.mouse.move(freshThumbBox.x + freshThumbBox.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(trackBox.x + trackBox.width - 8, y, { steps: 10 });
    await page.mouse.up();
    await helpResp;

    expect(sosCalls).toBe(1);
    await expect(page.getByTestId('watch-sos-overlay')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('SOS ACTIVE · SUPERVISOR & MEDIC NOTIFIED');
  });
});
