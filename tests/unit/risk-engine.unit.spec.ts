import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assessWorkerHeatRisk,
  computeMoranPsi,
  mapScoreToTier,
} from '../../src/shared/riskEngine.ts';
import type {
  BLETelemetryFrame,
  EnvironmentalObservation,
  FaultFlags,
  WorkerContext,
} from '../../src/shared/types.ts';

const psiFixture = JSON.parse(
  fs.readFileSync(path.resolve('fixtures/psi_reference_pairs.json'), 'utf-8')
);
const wbgtFixture = JSON.parse(
  fs.readFileSync(path.resolve('fixtures/historical_wbgt_day.json'), 'utf-8')
);

const peakObsRow = wbgtFixture.observations.find((o: { hourGst: number }) => o.hourGst === 11);
const BASE_ENV: EnvironmentalObservation = {
  ...peakObsRow,
  station: wbgtFixture.station,
  lat: wbgtFixture.lat,
  lon: wbgtFixture.lon,
  mode: 'historical_heatwave',
  sourceLabel: wbgtFixture.dataset,
  inUaeMiddayBreakWindow: false,
};

const BASE_CONTEXT: WorkerContext = {
  workerId: 'W-TEST-01',
  deviceId: 'BLE-TEST-01',
  roleLabel: 'Steel Fixer',
  zone: 'Zone A · Rebar Deck',
  ppeLevel: 'Standard Coverall',
  acclimatizationDays: 10,
  ageYears: 30,
  hr0: 68,
  tc0: 36.7,
  preferredLanguage: 'en',
  plannedBreakTime: '12:30',
  hydrationCount: 2,
  breaksTakenTodayMin: 20,
};

const NO_FAULTS: FaultFlags = {
  bleDisconnected: false,
  lowBattery: false,
  sensorNoise: false,
  gpsLoss: false,
};

describe('Risk Engine (Moran PSI + ACGIH WBGT)', () => {
  it('matches documented Moran et al. (1998) PSI reference input/output pairs across Green/Amber/Red', () => {
    for (const pair of psiFixture.moranReferencePairs) {
      const actual = computeMoranPsi(pair.input);
      expect(actual.psi, pair.id).toBeCloseTo(pair.expected.psi, 2);
      expect(actual.tcProxyC, pair.id).toBeCloseTo(pair.expected.tcProxyC, 2);
      expect(actual.hrMax, pair.id).toBe(pair.expected.hrMax);
      expect(mapScoreToTier(actual.psi), pair.id).toBe(pair.expected.psiTier);
    }
  });

  it('enforces exact tier cutoff boundaries without off-by-one errors (3.0, 3.99, 4.0, 6.0, 6.99, 7.0)', () => {
    for (const b of psiFixture.tierCutoffBoundaries) {
      expect(mapScoreToTier(b.score), `score=${b.score}`).toBe(b.expectedTier);
    }
    expect(mapScoreToTier(3.999)).toBe('Green');
    expect(mapScoreToTier(4.0)).toBe('Amber');
    expect(mapScoreToTier(6.999)).toBe('Amber');
    expect(mapScoreToTier(7.0)).toBe('Red');
  });

  it('produces Green, Amber, and Red composite assessments on full healthy BLE streams', () => {
    const coolEnv: EnvironmentalObservation = { ...BASE_ENV, wbgtC: 24.0 };
    const greenFrame: BLETelemetryFrame = {
      deviceId: 'BLE-TEST-01',
      workerId: 'W-TEST-01',
      timestamp: '2025-08-14T07:00:00+04:00',
      hrBpm: 90,
      skinTempC: 33.9,
      exertionIndex: 3.5,
      batteryPct: 90,
      rssiDbm: -60,
      gpsFix: true,
      signalQuality: 0.98,
    };
    const greenAssess = assessWorkerHeatRisk(BASE_CONTEXT, greenFrame, coolEnv, NO_FAULTS);
    expect(greenAssess.tier).toBe('Green');
    expect(greenAssess.scoringMode).toBe('physiological_plus_env');
    expect(greenAssess.psi).not.toBeNull();

    const amberFrame: BLETelemetryFrame = { ...greenFrame, hrBpm: 128, skinTempC: 35.1, exertionIndex: 6.5 };
    const amberAssess = assessWorkerHeatRisk(BASE_CONTEXT, amberFrame, BASE_ENV, NO_FAULTS);
    expect(amberAssess.tier).toBe('Amber');
    expect(amberAssess.compositeScore).toBeGreaterThanOrEqual(4.0);
    expect(amberAssess.compositeScore).toBeLessThan(7.0);

    const redFrame: BLETelemetryFrame = { ...greenFrame, hrBpm: 162, skinTempC: 36.8, exertionIndex: 8.8 };
    const redAssess = assessWorkerHeatRisk(BASE_CONTEXT, redFrame, BASE_ENV, NO_FAULTS);
    expect(redAssess.tier).toBe('Red');
    expect(redAssess.compositeScore).toBeGreaterThanOrEqual(7.0);
  });

  it('gracefully degrades to environment-only scoring on missing/faulted physiological inputs without crashing', () => {
    const corruptedFrame = {
      deviceId: 'BLE-TEST-01',
      workerId: 'W-TEST-01',
      timestamp: '2025-08-14T11:00:00+04:00',
      hrBpm: Number.NaN,
      skinTempC: null as unknown as number,
      exertionIndex: 5.0,
      batteryPct: 5, // triggers lowBattery
      rssiDbm: -999, // triggers bleDisconnected
      gpsFix: false, // triggers gpsDegraded
      signalQuality: 0.1, // triggers sensorNoise
    } as BLETelemetryFrame;

    const degraded = assessWorkerHeatRisk(
      BASE_CONTEXT,
      corruptedFrame,
      BASE_ENV,
      { bleDisconnected: true, lowBattery: true, sensorNoise: true, gpsLoss: true }
    );

    expect(degraded.scoringMode).toBe('environment_only_degraded');
    expect(degraded.psi).toBeNull();
    expect(degraded.tcProxyC).toBeNull();
    expect(degraded.gpsDegraded).toBe(true);
    expect(degraded.degradedReason).toContain('BLE link disconnected');
    expect(degraded.compositeScore).toBe(degraded.envRiskScore);
    expect(Number.isFinite(degraded.compositeScore)).toBe(true);
    expect(['Green', 'Amber', 'Red']).toContain(degraded.tier);
  });
});
