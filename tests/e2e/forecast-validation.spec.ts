import { expect, test } from '@playwright/test';
import {
  generateDeterministicSyntheticCohort,
  runProspectiveForecastValidation,
} from '../../src/shared/cohortAndValidation.ts';

test.describe('Prospective Forecast Validation (/forecast-validation)', () => {
  test('rendered MAE, RMSE, tier accuracy, and ablation table match independently recomputed values with non-zero realistic error', async ({
    page,
    request,
  }) => {
    const genRes = await request.post('/api/validation/generate-cohort', {
      data: { mode: 'deterministic', count: 24 },
    });
    expect(genRes.ok()).toBeTruthy();

    const cohort = generateDeterministicSyntheticCohort(24, 202608);
    const expected = runProspectiveForecastValidation(cohort);

    // Ensure forecast has non-trivial physiological error (guards against future-value leakage)
    expect(expected.baseline15.maePsi).toBeGreaterThan(0.08);
    expect(expected.baseline30.maePsi).toBeGreaterThan(expected.baseline15.maePsi);
    expect(expected.baseline15.tierAccuracyPct).toBeLessThan(99.5);

    await page.goto('/forecast-validation');
    await expect(
      page.getByRole('heading', { name: /Prospective Forecast Validation/i })
    ).toBeVisible();

    const mainText = await page.locator('main').innerText();
    expect(mainText).toContain(String(expected.baseline15.maePsi));
    expect(mainText).toContain(String(expected.baseline15.rmsePsi));
    expect(mainText).toContain(`${expected.baseline15.tierAccuracyPct}%`);
    expect(mainText).toContain(String(expected.baseline30.maePsi));
    expect(mainText).toContain(String(expected.baseline30.rmsePsi));
    expect(mainText).toContain(`${expected.baseline30.tierAccuracyPct}%`);
    expect(mainText).toContain(String(expected.ridgeAblation15.maePsi));
    expect(mainText).toContain(String(expected.ridgeAblation30.maePsi));

    // Verify interactive replay chart responds to mouse hover
    const svg = page.locator('main svg').first();
    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width * 0.55, box!.y + box!.height * 0.5);
    await expect(page.getByText(/Actual Score:/i)).toBeVisible();
    await expect(page.getByText(/t-15 Damped Trend:/i)).toBeVisible();
  });
});
