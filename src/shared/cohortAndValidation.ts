import {
  extractLaggedFeatures,
  predictCompositeTrajectory,
  predictWithLaggedRidge,
  trainLaggedRidgeModel,
} from './forecastEngine.ts';
import {
  assessWorkerHeatRisk,
  computeMoranPsi,
  getPpeClothingAdjustmentC,
  mapScoreToTier,
} from './riskEngine.ts';
import type {
  BacktestReport,
  BacktestTrajectorySummary,
  BLETelemetryFrame,
  EnvironmentalObservation,
  FaultFlags,
  ForecastMethodMetrics,
  ForecastReplaySample,
  ForecastValidationReport,
  PPELevel,
  RiskTier,
  SyntheticTrajectoryPoint,
  SyntheticWorkerDay,
  TelemetryHistoryPoint,
  WorkerContext,
} from './types.ts';
import { HISTORICAL_UAE_HEATWAVE_CURVE, isInMiddayBreakWindow } from './uaeWeatherData.ts';

/**
 * Generates an N-worker-day synthetic physiological cohort replayed against the
 * historical UAE heat-wave WBGT curve.
 * Every record is explicitly tagged `source: 'SYNTHETIC_PHYSIOLOGICAL_COHORT'`.
 */

const ROLES: { role: string; ppe: PPELevel; baseExertion: number }[] = [
  { role: 'Steel Fixer', ppe: 'Standard Coverall', baseExertion: 6.5 },
  { role: 'Scaffold Rigger', ppe: 'FR / Arc-Flash', baseExertion: 6.2 },
  { role: 'Concrete Pour Crew', ppe: 'Standard Coverall', baseExertion: 7.0 },
  { role: 'Electrical Maintenance', ppe: 'FR / Arc-Flash', baseExertion: 5.2 },
  { role: 'Tank Coating Tech', ppe: 'Chemical / Tyvek', baseExertion: 5.8 },
  { role: 'Crane Signalman', ppe: 'Standard Coverall', baseExertion: 4.3 },
];

// Deterministic PRNG (Mulberry32) so validation results are reproducible across runs
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function interpolateHeatwaveWbgt(minuteFrom0600: number): {
  wbgtC: number;
  obs: EnvironmentalObservation;
} {
  const hourFloat = 6 + minuteFrom0600 / 60;
  const clamped = Math.max(6, Math.min(18.99, hourFloat));
  const idx = Math.floor(clamped) - 6;
  const frac = clamped - Math.floor(clamped);
  const a = HISTORICAL_UAE_HEATWAVE_CURVE[idx] ?? HISTORICAL_UAE_HEATWAVE_CURVE[0];
  const b = HISTORICAL_UAE_HEATWAVE_CURVE[idx + 1] ?? a;
  const wbgtC = Number((a.wbgtC + frac * (b.wbgtC - a.wbgtC)).toFixed(2));
  const airTempC = Number((a.airTempC + frac * (b.airTempC - a.airTempC)).toFixed(1));

  return {
    wbgtC,
    obs: {
      ...a,
      hourGst: Math.floor(clamped),
      airTempC,
      wbgtC,
      mode: 'historical_heatwave',
      sourceLabel: 'Historical UAE Summer Heatwave Record (Abu Dhabi Mussafah CSV)',
      inUaeMiddayBreakWindow: isInMiddayBreakWindow(Math.floor(clamped), Math.round(frac * 60)),
    },
  };
}

export function generateDeterministicSyntheticCohort(count = 24, seed = 202608): SyntheticWorkerDay[] {
  const rand = mulberry32(seed);
  const cohort: SyntheticWorkerDay[] = [];

  for (let i = 0; i < count; i++) {
    const profile = ROLES[i % ROLES.length];
    const ageYears = 24 + Math.floor(rand() * 22);
    const hr0 = 64 + Math.floor(rand() * 14);
    const tc0 = Number((36.6 + rand() * 0.35).toFixed(2));
    const acclimatizationDays = i % 4 === 0 ? 2 + Math.floor(rand() * 4) : 8 + Math.floor(rand() * 16);

    // About 65% of trajectories escalate toward high heat strain; 35% remain moderated/well-paced
    const highStrainScenario = i % 3 !== 2;
    const ppeCaf = getPpeClothingAdjustmentC(profile.ppe);
    const acclimPenalty = acclimatizationDays < 7 ? 0.28 : 0.0;

    const points: SyntheticTrajectoryPoint[] = [];
    // Evaluate 240-minute morning-to-midday work window (08:00 to 12:00 GST, minuteOffset 120..360)
    // Sample every 3 minutes => 81 steps per worker-day
    // Start at realistic morning steady-state baseline (avoiding artificial startup slope spike)
    let skinTemp = 33.6 + (profile.baseExertion / 10) * 0.7 + rand() * 0.15;
    let hr = hr0 + (profile.baseExertion * 0.62 / 10) * 68 + 6;

    const rampStart = 45 + Math.floor(rand() * 60);
    const abruptLateSpike = highStrainScenario && i % 9 === 7;

    for (let m = 0; m <= 240; m += 3) {
      const { wbgtC } = interpolateHeatwaveWbgt(120 + m); // 08:00 + m min
      const effectiveHeat = wbgtC + ppeCaf;

      // Simulated work-rest cycle oscillations + exertion bursts
      const cycleWave = Math.sin((m + i * 11) / 22) * 0.14;
      const pacingFactor = abruptLateSpike
        ? m >= 171
          ? 1.75
          : 0.42
        : highStrainScenario
          ? m > rampStart
            ? 0.95 + Math.min(0.65, (m - rampStart) / 135) + cycleWave
            : 0.72 + cycleWave
          : 0.54 + cycleWave * 0.6;

      const targetExertion = Math.max(
        2.2,
        Math.min(9.5, profile.baseExertion * pacingFactor + (rand() - 0.5) * 1.1)
      );

      // Thermoregulatory physiological state evolution calibrated to Moran/ACGIH
      const targetHr =
        hr0 +
        (targetExertion / 10) * 68 +
        Math.max(0, effectiveHeat - 28) * (3.1 + acclimPenalty * 2.2) +
        (rand() - 0.5) * 6.5;

      hr = hr + (abruptLateSpike && m >= 171 ? 0.92 : 0.28) * (targetHr - hr);
      const clampedHr = Math.round(Math.max(hr0, Math.min(186, hr)));

      const targetSkin =
        33.5 +
        (targetExertion / 10) * 1.45 +
        Math.max(0, effectiveHeat - 29) * (0.28 + acclimPenalty * 0.14) +
        (rand() - 0.5) * 0.24;

      skinTemp = skinTemp + (abruptLateSpike && m >= 171 ? 0.92 : 0.18) * (targetSkin - skinTemp);
      const clampedSkin = Number(Math.max(33.0, Math.min(38.1, skinTemp)).toFixed(2));

      const { psi } = computeMoranPsi({
        hrBpm: clampedHr,
        skinTempC: clampedSkin,
        hr0,
        tc0,
        ageYears,
      });

      // Ground-truth simulated heat-exhaustion safety crossing: PSI >= 7.0 (Red threshold)
      const trueEvent = psi >= 7.0;

      points.push({
        minute: m,
        hrBpm: clampedHr,
        skinTempC: clampedSkin,
        exertionIndex: Number(targetExertion.toFixed(1)),
        wbgtC,
        trueHeatExhaustionEvent: trueEvent,
      });
    }

    cohort.push({
      trajectoryId: `SYN-WD-${String(i + 1).padStart(3, '0')}`,
      source: 'SYNTHETIC_PHYSIOLOGICAL_COHORT',
      generator: 'deterministic_calibrated',
      roleLabel: profile.role,
      ppeLevel: profile.ppe,
      acclimatizationDays,
      ageYears,
      hr0,
      tc0,
      points,
    });
  }

  return cohort;
}

const NO_FAULTS: FaultFlags = {
  bleDisconnected: false,
  lowBattery: false,
  sensorNoise: false,
  gpsLoss: false,
};

/**
 * Runs the real backtest of SiteGuard's Risk Engine + Predictive Early Warning
 * against the historical UAE heat-wave curve and synthetic physiological cohort.
 * Zero fabricated numbers — every metric is computed from the actual replay.
 */
export function runBacktest(cohort: SyntheticWorkerDay[]): BacktestReport {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let totalMinutesEvaluated = 0;
  const leadTimes: number[] = [];
  const trajectories: BacktestTrajectorySummary[] = [];

  for (const wd of cohort) {
    const context: WorkerContext = {
      workerId: wd.trajectoryId,
      deviceId: `SIM-${wd.trajectoryId}`,
      roleLabel: wd.roleLabel,
      zone: 'Mussafah Sector B',
      ppeLevel: wd.ppeLevel,
      acclimatizationDays: wd.acclimatizationDays,
      ageYears: wd.ageYears,
      hr0: wd.hr0,
      tc0: wd.tc0,
      preferredLanguage: 'en',
      plannedBreakTime: '12:30',
      hydrationCount: 2,
      breaksTakenTodayMin: 0,
    };

    let firstCrossingMin: number | null = null;
    let firstAlertMin: number | null = null;
    let falseAlarmsCount = 0;
    const history: TelemetryHistoryPoint[] = [];

    for (const pt of wd.points) {
      totalMinutesEvaluated += 3;
      const { obs } = interpolateHeatwaveWbgt(120 + pt.minute);
      const frame: BLETelemetryFrame = {
        deviceId: context.deviceId,
        workerId: context.workerId,
        timestamp: obs.timestampIso,
        hrBpm: pt.hrBpm,
        skinTempC: pt.skinTempC,
        exertionIndex: pt.exertionIndex,
        batteryPct: 88,
        rssiDbm: -62,
        gpsFix: true,
        signalQuality: 0.98,
      };

      const assessment = assessWorkerHeatRisk(context, frame, obs, NO_FAULTS);
      history.push({
        minuteOffset: pt.minute,
        timestamp: obs.timestampIso,
        psi: assessment.psi,
        compositeScore: assessment.compositeScore,
        wbgtC: obs.wbgtC,
        degraded: false,
      });

      const forecast = predictCompositeTrajectory(history, 0.45);
      // Early-warning alert for Red heat-exhaustion fires when Red is reached or t+15 forecasts Red
      const alertFired =
        assessment.tier === 'Red' ||
        forecast.predictedTier15 === 'Red';

      if (pt.trueHeatExhaustionEvent && firstCrossingMin === null) {
        firstCrossingMin = pt.minute;
      }
      if (alertFired && firstAlertMin === null) {
        firstAlertMin = pt.minute;
      }
    }

    const hadTrueEvent = firstCrossingMin !== null;
    let outcome: BacktestTrajectorySummary['outcome'];
    let leadTimeMin: number | null = null;

    if (hadTrueEvent) {
      if (firstAlertMin !== null && firstAlertMin <= firstCrossingMin! - 3) {
        tp++;
        outcome = 'True Positive';
        leadTimeMin = firstCrossingMin! - firstAlertMin;
        leadTimes.push(leadTimeMin);
      } else {
        fn++;
        outcome = 'False Negative';
        leadTimeMin = firstAlertMin !== null ? firstCrossingMin! - firstAlertMin : null;
      }
    } else {
      if (firstAlertMin !== null) {
        fp++;
        falseAlarmsCount = 1;
        outcome = 'False Positive';
      } else {
        tn++;
        outcome = 'True Negative';
      }
    }

    trajectories.push({
      trajectoryId: wd.trajectoryId,
      roleLabel: wd.roleLabel,
      ppeLevel: wd.ppeLevel,
      acclimatizationDays: wd.acclimatizationDays,
      hadTrueEvent,
      firstCrossingMin,
      firstAlertMin,
      leadTimeMin,
      falseAlarmsCount,
      outcome,
    });
  }

  const sensitivityPct = tp + fn > 0 ? Number(((tp / (tp + fn)) * 100).toFixed(1)) : 100;
  const specificityPct = tn + fp > 0 ? Number(((tn / (tn + fp)) * 100).toFixed(1)) : 100;
  const falseAlarmRatePct = tn + fp > 0 ? Number(((fp / (tn + fp)) * 100).toFixed(1)) : 0;
  const precisionPct = tp + fp > 0 ? Number(((tp / (tp + fp)) * 100).toFixed(1)) : 100;
  const f1Score =
    precisionPct + sensitivityPct > 0
      ? Number(((2 * precisionPct * sensitivityPct) / (precisionPct + sensitivityPct) / 100).toFixed(3))
      : 0;

  const sortedLeads = [...leadTimes].sort((a, b) => a - b);
  const meanLeadTimeMin =
    leadTimes.length > 0
      ? Number((leadTimes.reduce((s, v) => s + v, 0) / leadTimes.length).toFixed(1))
      : null;
  const medianLeadTimeMin =
    sortedLeads.length > 0 ? sortedLeads[Math.floor(sortedLeads.length / 2)] : null;

  return {
    cohortSize: cohort.length,
    cohortGenerator: cohort[0]?.generator ?? 'deterministic_calibrated',
    weatherDataset: 'Abu Dhabi Mussafah Peak Summer Heatwave CSV (08:00–12:00 GST)',
    totalMinutesEvaluated,
    trueEventsCount: tp + fn,
    detectedEventsCount: tp,
    sensitivityPct,
    specificityPct,
    falseAlarmRatePct,
    precisionPct,
    f1Score,
    meanLeadTimeMin,
    medianLeadTimeMin,
    trajectories,
    methodologyNote:
      'Environmental WBGT values are replayed from the bundled Abu Dhabi Mussafah historical heatwave record (real meteorological data). Physiological HR and skin-temperature streams are synthetic cohorts calibrated to Moran et al. (1998) PSI and ACGIH TLV thresholds. At every 3-minute step, SiteGuard evaluates composite score + t+15 predictive crossing and records lead time prior to the simulated heat-exhaustion event (PSI >= 7.0).',
    limitations: [
      'Physiological trajectories are synthetic (not clinical IRB human-subject trials); real-world HR variability and motion artifacts require calibration on field hardware.',
      'Skin temperature is used as a non-invasive proxy for core temperature; radiant solar load and sweat evaporation introduce individual variance.',
      'Backtest assumes clean BLE continuity; degraded environment-only mode is evaluated separately via fault injection.',
    ],
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Prospective Forecast Validation:
 * Splits cohort into training half (for Lagged Ridge ablation weights) and held-out
 * evaluation half. At each time step t, generates t+15 and t+30 predictions using ONLY
 * observations up to t, advances simulated time to t+15 / t+30, and compares
 * predicted vs actual PSI & Tier.
 */
export function runProspectiveForecastValidation(cohort: SyntheticWorkerDay[]): ForecastValidationReport {
  const splitIdx = Math.max(4, Math.floor(cohort.length / 2));
  const trainCohort = cohort.slice(0, splitIdx);
  const testCohort = cohort.slice(splitIdx);

  const buildHistory = (wd: SyntheticWorkerDay): TelemetryHistoryPoint[] => {
    const context: WorkerContext = {
      workerId: wd.trajectoryId,
      deviceId: `SIM-${wd.trajectoryId}`,
      roleLabel: wd.roleLabel,
      zone: 'Mussafah Sector B',
      ppeLevel: wd.ppeLevel,
      acclimatizationDays: wd.acclimatizationDays,
      ageYears: wd.ageYears,
      hr0: wd.hr0,
      tc0: wd.tc0,
      preferredLanguage: 'en',
      plannedBreakTime: '12:30',
      hydrationCount: 2,
      breaksTakenTodayMin: 0,
    };

    return wd.points.map((pt) => {
      const { obs } = interpolateHeatwaveWbgt(120 + pt.minute);
      const frame: BLETelemetryFrame = {
        deviceId: context.deviceId,
        workerId: context.workerId,
        timestamp: obs.timestampIso,
        hrBpm: pt.hrBpm,
        skinTempC: pt.skinTempC,
        exertionIndex: pt.exertionIndex,
        batteryPct: 90,
        rssiDbm: -60,
        gpsFix: true,
        signalQuality: 0.98,
      };
      const assess = assessWorkerHeatRisk(context, frame, obs, NO_FAULTS);
      return {
        minuteOffset: pt.minute,
        timestamp: obs.timestampIso,
        psi: assess.psi,
        compositeScore: assess.compositeScore,
        wbgtC: obs.wbgtC,
        degraded: false,
      };
    });
  };

  // Step 1: Train Lagged Ridge Regression ablation on trainCohort (steps of 3 min => +5 indices = +15 min, +10 indices = +30 min)
  const samples15: { features: number[]; target: number }[] = [];
  const samples30: { features: number[]; target: number }[] = [];

  for (const wd of trainCohort) {
    const hist = buildHistory(wd);
    const caf = getPpeClothingAdjustmentC(wd.ppeLevel);
    for (let i = 4; i < hist.length - 10; i++) {
      const feats = extractLaggedFeatures(hist.slice(0, i + 1), caf, wd.acclimatizationDays);
      if (!feats) continue;
      samples15.push({ features: feats, target: hist[i + 5].compositeScore });
      samples30.push({ features: feats, target: hist[i + 10].compositeScore });
    }
  }

  const ridge15 = trainLaggedRidgeModel(samples15);
  const ridge30 = trainLaggedRidgeModel(samples30);

  // Step 2: Evaluate prospectively on held-out testCohort
  const evalPairs = (horizonIdx: 5 | 10) => {
    const baseErrors: number[] = [];
    const ridgeErrors: number[] = [];
    let baseTierCorrect = 0;
    let ridgeTierCorrect = 0;
    let baseInCi = 0;
    let ridgeInCi = 0;
    let count = 0;

    for (const wd of testCohort) {
      const hist = buildHistory(wd);
      const caf = getPpeClothingAdjustmentC(wd.ppeLevel);
      for (let i = 4; i < hist.length - horizonIdx; i++) {
        const prefix = hist.slice(0, i + 1);
        const actualScore = hist[i + horizonIdx].compositeScore;
        const actualTier: RiskTier = mapScoreToTier(actualScore);

        const baseFc = predictCompositeTrajectory(prefix, 0.45);
        const feats = extractLaggedFeatures(prefix, caf, wd.acclimatizationDays);
        if (baseFc.status !== 'ready' || !feats) continue;

        const baseCi = horizonIdx === 5 ? baseFc.psi15! : baseFc.psi30!;
        const baseTier = horizonIdx === 5 ? baseFc.predictedTier15! : baseFc.predictedTier30!;

        const ridgePred = predictWithLaggedRidge(
          horizonIdx === 5 ? ridge15 : ridge30,
          feats,
          horizonIdx === 5 ? 15 : 30
        );

        baseErrors.push(actualScore - baseCi.point);
        ridgeErrors.push(actualScore - ridgePred.ci.point);

        if (baseTier === actualTier) baseTierCorrect++;
        if (ridgePred.tier === actualTier) ridgeTierCorrect++;
        if (actualScore >= baseCi.low && actualScore <= baseCi.high) baseInCi++;
        if (actualScore >= ridgePred.ci.low && actualScore <= ridgePred.ci.high) ridgeInCi++;
        count++;
      }
    }

    const computeStats = (
      modelName: string,
      horizonMin: 15 | 30,
      errors: number[],
      tierCorrect: number,
      inCi: number
    ): ForecastMethodMetrics => {
      const n = Math.max(1, errors.length);
      const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / n;
      const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);
      return {
        modelName,
        horizonMin,
        samplesEvaluated: errors.length,
        maePsi: Number(mae.toFixed(3)),
        rmsePsi: Number(rmse.toFixed(3)),
        tierAccuracyPct: Number(((tierCorrect / n) * 100).toFixed(1)),
        ci90CoveragePct: Number(((inCi / n) * 100).toFixed(1)),
      };
    };

    return {
      count,
      base: computeStats(
        'Baseline: Weighted Damped Trend',
        horizonIdx === 5 ? 15 : 30,
        baseErrors,
        baseTierCorrect,
        baseInCi
      ),
      ridge: computeStats(
        'Ablation: Lagged Ridge Regressor',
        horizonIdx === 5 ? 15 : 30,
        ridgeErrors,
        ridgeTierCorrect,
        ridgeInCi
      ),
    };
  };

  const res15 = evalPairs(5);
  const res30 = evalPairs(10);

  // Build sample replay series for the first test trajectory that exhibits an escalation
  const replayWd = testCohort.find((w) => w.points.some((p) => p.trueHeatExhaustionEvent)) ?? testCohort[0];
  const replayHist = buildHistory(replayWd);
  const replayCaf = getPpeClothingAdjustmentC(replayWd.ppeLevel);
  const sampleReplay: ForecastReplaySample[] = replayHist.map((pt, idx) => {
    // At index idx, display actual PSI and what t-15 forecast had predicted for this minute
    let predBase: number | null = null;
    let predLow: number | null = null;
    let predHigh: number | null = null;
    let predRidge: number | null = null;
    if (idx >= 9) {
      const originIdx = idx - 5; // 15 min earlier
      const prefix = replayHist.slice(0, originIdx + 1);
      const fc = predictCompositeTrajectory(prefix, 0.45);
      const feats = extractLaggedFeatures(prefix, replayCaf, replayWd.acclimatizationDays);
      if (fc.status === 'ready' && fc.psi15) {
        predBase = fc.psi15.point;
        predLow = fc.psi15.low;
        predHigh = fc.psi15.high;
      }
      if (feats) {
        predRidge = predictWithLaggedRidge(ridge15, feats, 15).ci.point;
      }
    }
    return {
      minute: pt.minuteOffset,
      actualPsi: Number(pt.compositeScore.toFixed(2)),
      predicted15Baseline: predBase,
      predicted15Low: predLow,
      predicted15High: predHigh,
      predicted15Ridge: predRidge,
    };
  });

  return {
    cohortSize: cohort.length,
    samplesEvaluated15: res15.count,
    samplesEvaluated30: res30.count,
    baseline15: res15.base,
    baseline30: res30.base,
    ridgeAblation15: res15.ridge,
    ridgeAblation30: res30.ridge,
    sampleReplayTrajectoryId: replayWd.trajectoryId,
    sampleReplay,
    methodologyNote:
      'Prospective walk-forward validation on held-out synthetic worker-days (50/50 train-test split). At each time t, predictions for t+15 and t+30 are computed strictly from observations <= t, then scored against realized future PSI and Risk Tier. Zero LLM calls are used for numeric prediction.',
    generatedAt: new Date().toISOString(),
  };
}
