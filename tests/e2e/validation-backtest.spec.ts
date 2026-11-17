import { expect, test } from '@playwright/test';
import {
  generateDeterministicSyntheticCohort,
  runBacktest,
} from '../../src/shared/cohortAndValidation.ts';

test.describe('Historical Backtest Validation UI (/validation)', () => {
  test('rendered /validation metrics match independently recomputed deterministic backtest and stay within realistic bounds', async ({
    page,
    request,
  }) => {
    const genRes = await request.post('/api/validation/generate-cohort', {
      data: { mode: 'deterministic', count: 24 },
    });
    expect(genRes.ok()).toBeTruthy();

    const cohort = generateDeterministicSyntheticCohort(24, 202608);
    const expected = runBacktest(cohort);

    await page.goto('/validation');
    await expect(
      page.getByRole('heading', { name: 'Historical Heat-Wave Backtest Validation' })
    ).toBeVisible();

    const pageText = await page.locator('main').innerText();
    expect(pageText).toContain(`${expected.meanLeadTimeMin}m`);
    expect(pageText).toContain(`${expected.sensitivityPct}%`);
    expect(pageText).toContain(`${expected.falseAlarmRatePct}%`);
    expect(pageText).toContain(`${expected.precisionPct}%`);
    expect(pageText).toContain(`${expected.f1Score}`);
    expect(pageText).toContain(`${expected.detectedEventsCount}/${expected.trueEventsCount} crossings detected`);

    // Sanity bounds: prevent regressions into either broken 0% or overfit 100%/0% perfection
    expect(expected.sensitivityPct).toBeGreaterThan(70);
    expect(expected.sensitivityPct).toBeLessThan(100);
    expect(expected.falseAlarmRatePct).toBeGreaterThan(0);
    expect(expected.falseAlarmRatePct).toBeLessThan(40);
  });
});
