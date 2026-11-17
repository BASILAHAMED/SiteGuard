import { expect, test, type Locator, type Page } from '@playwright/test';

async function dragSliderToFraction(page: Page, slider: Locator, fraction: number) {
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  if (!box) throw new Error('Slider boundingBox unavailable');
  const min = Number((await slider.getAttribute('min')) ?? 0);
  const max = Number((await slider.getAttribute('max')) ?? 100);
  const cur = Number(await slider.inputValue());
  const curFrac = Math.max(0, Math.min(1, (cur - min) / Math.max(1e-6, max - min)));

  const thumbInset = 8;
  const usableW = Math.max(10, box.width - thumbInset * 2);
  const startX = box.x + thumbInset + usableW * curFrac;
  const targetX = box.x + thumbInset + usableW * Math.max(0, Math.min(1, fraction));
  const y = box.y + box.height / 2;

  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(targetX, y, { steps: 5 });
  await page.mouse.up();
}

test.describe('Worker Flow & Cross-Page Check-In', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post('/api/system/reset', { data: { scenario: 'default' } });
    expect(res.ok()).toBeTruthy();
  });

  test('loads /worker in Green tier by default with baseline copy', async ({ page }) => {
    await page.goto('/worker');
    await expect(page.getByRole('heading', { name: /Worker Wearable/i })).toBeVisible();
    await expect(page.getByText('GREEN · NOMINAL')).toBeVisible();
    await expect(page.getByText(/SAFE TO WORK/i)).toBeVisible();
    await expect(page.getByText(/Composite \d+\.\d\/10 · PSI \d+\.\d/)).toBeVisible();
  });

  test('dragging HR/skin-temp/exertion sliders into Amber and Red updates tier, alert copy, and icon', async ({
    page,
  }) => {
    await page.goto('/worker');
    await expect(page.getByText('GREEN · NOMINAL')).toBeVisible();

    // Expand demoted Developer / BLE Simulator drawer before interacting with sliders
    await page.getByRole('button', { name: /Developer \/ BLE Simulator/i }).click();

    const hrSlider = page.locator('#hr-slider');
    const skinSlider = page.locator('#skin-slider');
    const exertionSlider = page.locator('#exertion-slider');

    // Drag into Amber physiological zone and wait for final debounced BLE ingestion POST
    await dragSliderToFraction(page, hrSlider, 0.45);
    await dragSliderToFraction(page, skinSlider, 0.34);
    const amberPost = page.waitForResponse(
      (r) => r.url().includes('/api/ble/telemetry') && r.request().method() === 'POST'
    );
    await dragSliderToFraction(page, exertionSlider, 0.45);
    await amberPost;

    await expect(page.getByText('AMBER · REST IN SHADE')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/REST IN SHADE|15-min|shaded/i).first()).toBeVisible();

    // Drag further into Critical Red zone
    await dragSliderToFraction(page, hrSlider, 0.94);
    await dragSliderToFraction(page, skinSlider, 0.92);
    const redPost = page.waitForResponse(
      (r) => r.url().includes('/api/ble/telemetry') && r.request().method() === 'POST'
    );
    await dragSliderToFraction(page, exertionSlider, 0.95);
    await redPost;

    await expect(page.getByText('RED · STOP WORK')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/STOP WORK NOW/i)).toBeVisible();
    // Tier SVG icon inside wearable banner must render visibly
    await expect(page.locator('section svg').first()).toBeVisible();
  });

  test('renders translated alert text in multiple supported languages when selector changes', async ({
    page,
  }) => {
    await page.goto('/worker');
    await expect(page.getByText(/SAFE TO WORK/i)).toBeVisible();

    // Switch to Hindi (हिन्दी) and assert actual Devanagari script is rendered
    const hiResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/language') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'हिन्दी' }).click();
    await hiResp;
    const alertBox = page.locator('div[dir]').first();
    await expect(alertBox).toHaveAttribute('dir', 'ltr');
    await expect(alertBox).toContainText(/[\u0900-\u097F]{3,}/);

    // Switch to Urdu (اردو) and assert RTL layout + Arabic/Urdu script
    const urResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/language') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'اردو' }).click();
    await urResp;
    await expect(alertBox).toHaveAttribute('dir', 'rtl');
    await expect(alertBox).toContainText(/[\u0600-\u06FF]{3,}/);

    // Switch to Tagalog and assert Tagalog safety copy
    const tlResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/language') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Tagalog' }).click();
    await tlResp;
    await expect(alertBox).toContainText(/LIGTAS|TUBIG|MAGPAHINGA|ITIGIL/i);
  });

  test('"I\'m Okay" and "Need Help" clicks produce status confirmation and propagate to /supervisor', async ({
    page,
  }) => {
    await page.goto('/worker');

    const okResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/checkin') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: "I'm Okay" }).click();
    await okResp;
    await expect(page.getByRole('status')).toContainText('CHECK-IN CONFIRMED · WORKER OKAY');

    const helpResp = page.waitForResponse(
      (r) => r.url().includes('/api/worker/W-101/checkin') && r.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Need Help' }).click();
    await helpResp;
    await expect(page.getByRole('status')).toContainText('SOS ACTIVE · SUPERVISOR & MEDIC NOTIFIED');

    // Cross-page assertion onto /supervisor
    await page.goto('/supervisor');
    await expect(page.getByText('WORKER REQUESTED HELP')).toBeVisible();
    await expect(page.getByText('Worker pressed NEED HELP on wearable unit.').first()).toBeVisible();
  });

  test('toggles all environmental and wearable temperature readings between Celsius and Fahrenheit', async ({
    page,
  }) => {
    await page.goto('/worker');

    // Default Celsius readouts (11:00 GST: Air 44.4°C, WBGT 35.0°C, W-101 skin 34.0°C)
    await expect(page.getByText('Air 44.4°C')).toBeVisible();
    await expect(page.getByText('35.0°C')).toBeVisible();
    await expect(page.getByText('Skin 34.0°C')).toBeVisible();

    const unitSwitch = page.getByRole('switch', {
      name: /Toggle temperature unit between Celsius and Fahrenheit/i,
    });
    await expect(unitSwitch).toHaveAttribute('aria-checked', 'false');

    // Toggle to Fahrenheit: 44.4°C -> 111.9°F, 35.0°C -> 95.0°F, 34.0°C -> 93.2°F
    await unitSwitch.click();
    await expect(unitSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Air 111.9°F')).toBeVisible();
    await expect(page.getByText('95.0°F')).toBeVisible();
    await expect(page.getByText('Skin 93.2°F')).toBeVisible();

    // Persists across route navigation and toggles cleanly back to Celsius
    await page.goto('/supervisor');
    await expect(page.getByText('Air 111.9°F')).toBeVisible();
    await expect(page.getByText('95.0°F').first()).toBeVisible();

    await page
      .getByRole('switch', { name: /Toggle temperature unit between Celsius and Fahrenheit/i })
      .click();
    await expect(page.getByText('Air 44.4°C')).toBeVisible();
  });
});
