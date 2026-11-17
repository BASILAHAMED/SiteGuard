import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  generateDeterministicSyntheticCohort,
  runBacktest,
  runProspectiveForecastValidation,
} from '../../src/shared/cohortAndValidation.ts';
import type { SyntheticWorkerDay } from '../../src/shared/types.ts';

const cohortFixtureFile = JSON.parse(
  fs.readFileSync(path.resolve('fixtures/synthetic_cohort_fixture.json'), 'utf-8')
) as { seed: number; cohort: SyntheticWorkerDay[] };

describe('Validation Backtest & Prospective Determinism / Sanity Bounds', () => {
  it('computes deterministic backtest metrics on the static checked-in synthetic cohort fixture within realistic bounds (not 100%, not 0%)', () => {
    const run1 = runBacktest(cohortFixtureFile.cohort);
    const run2 = runBacktest(cohortFixtureFile.cohort);

    expect(run1.sensitivityPct).toBe(run2.sensitivityPct);
    expect(run1.falseAlarmRatePct).toBe(run2.falseAlarmRatePct);
    expect(run1.meanLeadTimeMin).toBe(run2.meanLeadTimeMin);
    expect(run1.f1Score).toBe(run2.f1Score);

    // Flag unrealistic overfitting (100% sensitivity / 0% false alarms) or broken detection (0%)
    expect(run1.sensitivityPct).toBeGreaterThanOrEqual(70);
    expect(run1.sensitivityPct).toBeLessThan(100);
    expect(run1.falseAlarmRatePct).toBeGreaterThan(0);
    expect(run1.falseAlarmRatePct).toBeLessThan(40);
    expect(run1.meanLeadTimeMin).not.toBeNull();
    expect(run1.meanLeadTimeMin!).toBeGreaterThan(15);
    expect(run1.meanLeadTimeMin!).toBeLessThan(150);
  });

  it('produces identical cohort and prospective forecast metrics given fixed seed 202608 with no near-zero future-leakage error', () => {
    const c1 = generateDeterministicSyntheticCohort(24, 202608);
    const c2 = generateDeterministicSyntheticCohort(24, 202608);
    expect(c1).toEqual(c2);

    const fv1 = runProspectiveForecastValidation(c1);
    const fv2 = runProspectiveForecastValidation(c2);
    expect(fv1.baseline15).toEqual(fv2.baseline15);
    expect(fv1.baseline30).toEqual(fv2.baseline30);
    expect(fv1.ridgeAblation15).toEqual(fv2.ridgeAblation15);
    expect(fv1.ridgeAblation30).toEqual(fv2.ridgeAblation30);

    // Guard against future-leakage (near-zero MAE/RMSE) or degraded uselessness
    expect(fv1.baseline15.maePsi).toBeGreaterThan(0.08);
    expect(fv1.baseline15.maePsi).toBeLessThan(0.6);
    expect(fv1.baseline30.maePsi).toBeGreaterThan(fv1.baseline15.maePsi);
    expect(fv1.baseline15.tierAccuracyPct).toBeGreaterThan(75);
    expect(fv1.baseline15.tierAccuracyPct).toBeLessThan(99.5);
  });
});
