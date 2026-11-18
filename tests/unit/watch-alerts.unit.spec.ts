import { describe, expect, it } from 'vitest';
import {
  PREWARN_WINDOW_MIN,
  diffWorkerStates,
  newSosCheckIn,
} from '../../src/components/watch/alertDiff';
import type { RiskTier, WorkerAlertCopy, WorkerStateSelf } from '../../src/shared/types';

const copy: WorkerAlertCopy = {
  headline: 'H',
  explanation: 'E',
  action: 'Move to shade and drink water.',
  proactiveForecastNote: null,
  source: 'template_fallback',
  cached: false,
};

function state(over: {
  tier?: RiskTier;
  amberEta?: number | null;
  redEta?: number | null;
  status?: 'ready' | 'insufficient_trend_data';
  ble?: boolean;
  degradedReason?: string | null;
  directive?: string | null;
  checkIn?: { status: 'okay' | 'help'; timestamp: string } | null;
  workerId?: string;
} = {}): WorkerStateSelf {
  const tier = over.tier ?? 'Green';
  const ble = over.ble ?? false;
  return {
    context: {
      workerId: over.workerId ?? 'W-101',
      deviceId: 'BLE-BAND-101',
      roleLabel: 'Steel Fixer',
      zone: 'Zone A',
      ppeLevel: 'Standard Coverall',
      acclimatizationDays: 3,
      ageYears: 29,
      hr0: 68,
      tc0: 36.7,
      preferredLanguage: 'en',
      plannedBreakTime: '12:30',
      hydrationCount: 2,
      breaksTakenTodayMin: 20,
    },
    latestFrame: {
      deviceId: 'BLE-BAND-101',
      workerId: 'W-101',
      timestamp: '2026-11-18T10:00:00Z',
      hrBpm: 100,
      skinTempC: 34,
      exertionIndex: 5,
      batteryPct: 80,
      rssiDbm: -60,
      gpsFix: true,
      signalQuality: 0.97,
    },
    faults: { bleDisconnected: ble, lowBattery: false, sensorNoise: false, gpsLoss: false },
    assessment: {
      workerId: 'W-101',
      timestamp: '2026-11-18T10:00:00Z',
      psi: ble ? null : 3,
      tcProxyC: 37,
      hrMaxEstimated: 188,
      effectiveWbgtC: 32,
      acgihActionLimitC: 25,
      acgihTlvLimitC: 28,
      envRiskScore: 5,
      compositeScore: tier === 'Red' ? 8 : tier === 'Amber' ? 5 : 2,
      tier,
      scoringMode: ble ? 'environment_only_degraded' : 'physiological_plus_env',
      degradedReason: ble ? (over.degradedReason ?? 'BLE link disconnected') : null,
      gpsDegraded: false,
      contributingFactors: [],
      recommendedAction: 'x',
    },
    forecast: {
      status: over.status ?? 'ready',
      cleanWindowSamples: 5,
      windowMinutes: 12,
      psiNow: 2,
      psi15: { point: 3, low: 2, high: 4 },
      psi30: { point: 4, low: 3, high: 5 },
      predictedTier15: 'Green',
      predictedTier30: 'Green',
      projectedAmberCrossingMin: over.amberEta ?? null,
      projectedRedCrossingMin: over.redEta ?? null,
      slopePerMin: 0.1,
      modelLabel: 'm',
    },
    history: [],
    alertTranslations: { en: copy, hi: copy, ur: copy, bn: copy, tl: copy },
    lastCheckIn: over.checkIn ?? null,
    supervisorDirective: over.directive ?? null,
    simulatedClockMin: 12,
  };
}

const kinds = (prev: WorkerStateSelf | null, next: WorkerStateSelf) =>
  diffWorkerStates(prev, next, copy, 1000).map((a) => a.kind);

describe('watch alert transition engine', () => {
  it('first load: Green is silent, Amber/Red raise their tier alert', () => {
    expect(kinds(null, state())).toEqual([]);
    expect(kinds(null, state({ tier: 'Amber' }))).toEqual(['amber']);
    expect(kinds(null, state({ tier: 'Red' }))).toEqual(['red']);
  });

  it('Green→Amber raises Amber banner with the API action text verbatim', () => {
    const [a] = diffWorkerStates(state(), state({ tier: 'Amber' }), copy, 1);
    expect(a.kind).toBe('amber');
    expect(a.body).toBe(copy.action);
    expect(a.requiresAck).toBe(false);
    expect(a.haptic).toBe('double');
  });

  it('any tier →Red raises a takeover that requires acknowledgement', () => {
    for (const from of ['Green', 'Amber'] as RiskTier[]) {
      const [a] = diffWorkerStates(state({ tier: from }), state({ tier: 'Red' }), copy, 1);
      expect(a.kind).toBe('red');
      expect(a.requiresAck).toBe(true);
      expect(a.autoDismissMs).toBe(0);
      expect(a.haptic).toBe('triple-long');
    }
  });

  it('staying Red does not re-alert', () => {
    expect(kinds(state({ tier: 'Red' }), state({ tier: 'Red' }))).toEqual([]);
  });

  it('tier drop raises a recovery notification', () => {
    const [a] = diffWorkerStates(state({ tier: 'Red' }), state({ tier: 'Amber' }), copy, 1);
    expect(a.kind).toBe('recovery');
    expect(a.title).toBe('Strain easing');
    const [b] = diffWorkerStates(state({ tier: 'Amber' }), state(), copy, 1);
    expect(b.title).toBe('Back to safe range');
  });

  it('pre-warning uses the engine ETA exactly and only when it first enters the window', () => {
    const [a] = diffWorkerStates(state(), state({ amberEta: 6 }), copy, 1);
    expect(a.kind).toBe('prewarn-amber');
    expect(a.title).toBe('Amber in ~6 min');
    // already inside the window → no repeat
    expect(kinds(state({ amberEta: 6 }), state({ amberEta: 4 }))).toEqual([]);
    // outside window → nothing
    expect(kinds(state(), state({ amberEta: PREWARN_WINDOW_MIN + 5 }))).toEqual([]);
  });

  it('never pre-warns when the engine projects nothing or data is insufficient', () => {
    expect(kinds(state(), state({ amberEta: null, redEta: null }))).toEqual([]);
    expect(kinds(state(), state({ amberEta: 3, status: 'insufficient_trend_data' }))).toEqual([]);
    expect(kinds(state(), state({ amberEta: 0 }))).toEqual([]);
  });

  it('Red pre-warning while Amber; no pre-warning once already Red', () => {
    expect(kinds(state({ tier: 'Amber' }), state({ tier: 'Amber', redEta: 4 }))).toEqual(['prewarn-red']);
    expect(kinds(state({ tier: 'Amber' }), state({ tier: 'Red', redEta: 4 }))).toEqual(['red']);
  });

  it('fault on/off uses degradedReason verbatim', () => {
    const on = diffWorkerStates(state(), state({ ble: true, degradedReason: 'BLE link disconnected · ENV-ONLY' }), copy, 1);
    expect(on.map((a) => a.kind)).toEqual(['fault-on']);
    expect(on[0].body).toBe('BLE link disconnected · ENV-ONLY');
    expect(kinds(state({ ble: true }), state())).toEqual(['fault-off']);
  });

  it('new supervisor directive raises a push message (not on first load)', () => {
    expect(kinds(null, state({ directive: 'Take 15m break' }))).toEqual([]);
    const [a] = diffWorkerStates(state(), state({ directive: 'Take 15m break' }), copy, 1);
    expect(a.kind).toBe('directive');
    expect(a.body).toBe('Take 15m break');
    expect(kinds(state({ directive: 'X' }), state({ directive: 'X' }))).toEqual([]);
  });

  it('results are ordered by priority (Red first)', () => {
    const out = kinds(state(), state({ tier: 'Red', ble: true, directive: 'Stop' }));
    expect(out[0]).toBe('red');
    expect(out).toEqual(['red', 'directive', 'fault-on']);
  });

  it('switching worker resets the baseline', () => {
    expect(kinds(state({ tier: 'Amber' }), state({ tier: 'Amber', workerId: 'W-102' }))).toEqual(['amber']);
  });

  it('detects a new SOS check-in only once', () => {
    const help = { status: 'help' as const, timestamp: '2026-11-18T10:01:00Z' };
    expect(newSosCheckIn(state(), state({ checkIn: help }))).toBe(true);
    expect(newSosCheckIn(state({ checkIn: help }), state({ checkIn: help }))).toBe(false);
    expect(newSosCheckIn(state(), state({ checkIn: { status: 'okay', timestamp: 'x' } }))).toBe(false);
  });
});
