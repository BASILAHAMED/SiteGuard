import { RISK_TIER_THRESHOLDS, mapScoreToTier } from './riskEngine.ts';
import type {
  ConfidenceInterval,
  ForecastOutput,
  RiskTier,
  TelemetryHistoryPoint,
} from './types.ts';

/**
 * SiteGuard Deterministic Forecast Engine (NO LLM numeric prediction).
 *
 * Uses the trailing 10–15 minute clean physiological + environmental history window
 * to extrapolate composite strain trajectory to t+15 and t+30 minutes using
 * weighted linear + damped quadratic trend regression plus environmental WBGT drift.
 *
 * Safety Invariant:
 * - If fewer than 4 clean (non-degraded) telemetry samples exist in the trailing window
 *   (e.g., cold start or immediately after clearing a BLE/sensor fault), the engine
 *   returns status: 'insufficient_trend_data' and NEVER fabricates a prediction.
 *
 * Also includes a Ridge-regularized lagged-feature linear regressor trained on
 * synthetic cohort trajectories as an ablation model evaluated on /forecast-validation.
 */

export const MIN_CLEAN_FORECAST_SAMPLES = 4;

export function predictCompositeTrajectory(
  history: TelemetryHistoryPoint[],
  wbgtSlopePerHour = 0.4
): ForecastOutput {
  // Filter to trailing 15 minutes of clean (non-degraded) samples
  if (history.length === 0) {
    return {
      status: 'insufficient_trend_data',
      reason: 'Cold start: awaiting initial telemetry stream.',
      cleanWindowSamples: 0,
      windowMinutes: 0,
      psiNow: null,
      psi15: null,
      psi30: null,
      predictedTier15: null,
      predictedTier30: null,
      projectedAmberCrossingMin: null,
      projectedRedCrossingMin: null,
      slopePerMin: null,
      modelLabel: 'Weighted Damped Trend + Residual CI',
    };
  }

  const latestTime = history[history.length - 1].minuteOffset;
  // Require contiguous clean tail since last degraded sample
  const cleanTail: TelemetryHistoryPoint[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const pt = history[i];
    if (pt.degraded || pt.psi === null) {
      break; // Stop at any fault boundary — post-fault recovery requires fresh clean window
    }
    if (latestTime - pt.minuteOffset <= 15) {
      cleanTail.unshift(pt);
    }
  }

  if (cleanTail.length < MIN_CLEAN_FORECAST_SAMPLES) {
    return {
      status: 'insufficient_trend_data',
      reason:
        cleanTail.length === 0
          ? 'Sensor fault active or just cleared: collecting clean physiological window.'
          : `Insufficient clean trend window (${cleanTail.length}/${MIN_CLEAN_FORECAST_SAMPLES} clean samples collected).`,
      cleanWindowSamples: cleanTail.length,
      windowMinutes:
        cleanTail.length > 1
          ? cleanTail[cleanTail.length - 1].minuteOffset - cleanTail[0].minuteOffset
          : 0,
      psiNow: cleanTail.length > 0 ? cleanTail[cleanTail.length - 1].compositeScore : null,
      psi15: null,
      psi30: null,
      predictedTier15: null,
      predictedTier30: null,
      projectedAmberCrossingMin: null,
      projectedRedCrossingMin: null,
      slopePerMin: null,
      modelLabel: 'Weighted Damped Trend + Residual CI',
    };
  }

  // Fit recency-weighted linear regression on compositeScore vs relative time t in [-15..0]
  const n = cleanTail.length;
  const xs = cleanTail.map((p) => p.minuteOffset - latestTime);
  const ys = cleanTail.map((p) => p.compositeScore);
  const ws = cleanTail.map((_, idx) => 0.5 + 0.5 * ((idx + 1) / n)); // Higher weight on recent samples

  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  for (let i = 0; i < n; i++) {
    sumW += ws[i];
    sumWX += ws[i] * xs[i];
    sumWY += ws[i] * ys[i];
  }
  const xBar = sumWX / sumW;
  const yBar = sumWY / sumW;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xBar;
    num += ws[i] * dx * (ys[i] - yBar);
    den += ws[i] * dx * dx;
  }

  const rawSlope = den > 1e-6 ? num / den : 0;
  // Blend environmental WBGT drift (+0.08 PSI per °C/hr rise) and damp extreme instantaneous spikes
  const envDriftPerMin = (wbgtSlopePerHour / 60) * 0.25;
  const dampedSlope = Math.max(-0.22, Math.min(0.28, rawSlope * 0.88 + envDriftPerMin));

  // Estimate second-order curvature (acceleration) from first half vs second half of window
  const mid = Math.floor(n / 2);
  let accel = 0;
  if (n >= 6 && mid >= 2) {
    const dt1 = Math.max(1, xs[mid] - xs[0]);
    const dt2 = Math.max(1, xs[n - 1] - xs[mid]);
    const s1 = (ys[mid] - ys[0]) / dt1;
    const s2 = (ys[n - 1] - ys[mid]) / dt2;
    accel = Math.max(-0.004, Math.min(0.004, (s2 - s1) / ((dt1 + dt2) * 0.5)));
  }

  // Residual standard error for empirical 90% confidence intervals (z = 1.645)
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = yBar + rawSlope * (xs[i] - xBar);
    sse += (ys[i] - pred) * (ys[i] - pred);
  }
  const rmse = Math.sqrt(sse / Math.max(1, n - 2));
  const psiNow = ys[n - 1];

  const extrapolate = (horizonMin: number): ConfidenceInterval => {
    // Damped quadratic extrapolation (quadratic term saturates smoothly for stability)
    const effectiveH = horizonMin === 30 ? 26.5 : horizonMin;
    const delta = dampedSlope * effectiveH + 0.35 * accel * effectiveH * effectiveH;
    const point = clampScore(psiNow + delta);
    const halfWidth = Math.max(0.28, 1.645 * Math.sqrt(rmse * rmse + Math.pow(0.028 * horizonMin, 2)));
    return {
      point: Number(point.toFixed(2)),
      low: Number(clampScore(point - halfWidth).toFixed(2)),
      high: Number(clampScore(point + halfWidth).toFixed(2)),
    };
  };

  const psi15 = extrapolate(15);
  const psi30 = extrapolate(30);

  // Projected threshold crossing times (if currently below threshold and trending upward)
  const projectedAmberCrossingMin = estimateCrossingMinutes(psiNow, dampedSlope, RISK_TIER_THRESHOLDS.amberMin);
  const projectedRedCrossingMin = estimateCrossingMinutes(psiNow, dampedSlope, RISK_TIER_THRESHOLDS.redMin);

  return {
    status: 'ready',
    cleanWindowSamples: n,
    windowMinutes: cleanTail[n - 1].minuteOffset - cleanTail[0].minuteOffset,
    psiNow: Number(psiNow.toFixed(2)),
    psi15,
    psi30,
    predictedTier15: mapScoreToTier(psi15.point),
    predictedTier30: mapScoreToTier(psi30.point),
    projectedAmberCrossingMin,
    projectedRedCrossingMin,
    slopePerMin: Number(dampedSlope.toFixed(3)),
    modelLabel: 'Weighted Damped Trend + Residual CI',
  };
}

function estimateCrossingMinutes(current: number, slopePerMin: number, threshold: number): number | null {
  if (current >= threshold) return 0;
  if (slopePerMin <= 0.015) return null;
  const raw = (threshold - current) / slopePerMin;
  if (raw > 60) return null;
  return Math.max(1, Math.round(raw));
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(10, v));
}

/**
 * Lightweight Ridge-Regularized Lagged Regressor (Ablation Model).
 * Trained deterministically on lagged features from the synthetic cohort
 * using normal equations (X^T X + lambda I)^(-1) X^T y via Gauss-Jordan elimination.
 */
export interface LaggedRidgeModel {
  weights: number[]; // [bias, scoreNow, delta5m, delta10m, wbgt, ppeCaf, acclimNorm]
  residualStd: number;
}

export function extractLaggedFeatures(
  history: TelemetryHistoryPoint[],
  ppeCaf: number,
  acclimatizationDays: number
): number[] | null {
  if (history.length < 4) return null;
  const n = history.length;
  const now = history[n - 1];
  if (now.degraded || now.psi === null) return null;

  const findAtLag = (lagMin: number): TelemetryHistoryPoint => {
    const target = now.minuteOffset - lagMin;
    let best = history[0];
    let bestDiff = Infinity;
    for (let i = n - 1; i >= 0; i--) {
      if (history[i].degraded || history[i].psi === null) continue;
      const diff = Math.abs(history[i].minuteOffset - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = history[i];
      }
    }
    return best;
  };

  const p5 = findAtLag(5);
  const p10 = findAtLag(10);
  const dt5 = Math.max(1, now.minuteOffset - p5.minuteOffset);
  const dt10 = Math.max(1, now.minuteOffset - p10.minuteOffset);

  const d5 = (now.compositeScore - p5.compositeScore) / dt5;
  const d10 = (now.compositeScore - p10.compositeScore) / dt10;

  return [
    1,
    now.compositeScore,
    d5,
    d10,
    (now.wbgtC - 30) / 10,
    ppeCaf / 4,
    Math.min(14, acclimatizationDays) / 14,
  ];
}

export function trainLaggedRidgeModel(
  samples: { features: number[]; target: number }[],
  lambda = 2.5
): LaggedRidgeModel {
  const d = 7;
  if (samples.length < 10) {
    return { weights: [0, 1, 10, 5, 0.2, 0.1, -0.05], residualStd: 0.45 };
  }

  // Build X^T X + lambda I and X^T y
  const A: number[][] = Array.from({ length: d }, () => Array(d).fill(0));
  const b: number[] = Array(d).fill(0);

  for (const s of samples) {
    for (let i = 0; i < d; i++) {
      b[i] += s.features[i] * s.target;
      for (let j = 0; j < d; j++) {
        A[i][j] += s.features[i] * s.features[j];
      }
    }
  }
  for (let i = 1; i < d; i++) {
    A[i][i] += lambda;
  }
  A[0][0] += 1e-4;

  const weights = solveLinearSystem(A, b);
  let sse = 0;
  for (const s of samples) {
    const pred = dot(weights, s.features);
    sse += (s.target - pred) * (s.target - pred);
  }
  const residualStd = Math.sqrt(sse / Math.max(1, samples.length - d));

  return { weights, residualStd };
}

export function predictWithLaggedRidge(
  model: LaggedRidgeModel,
  features: number[],
  horizonMin: number
): { ci: ConfidenceInterval; tier: RiskTier } {
  const raw = dot(model.weights, features);
  const point = Number(clampScore(raw).toFixed(2));
  const half = Math.max(0.25, 1.645 * model.residualStd * (horizonMin === 30 ? 1.15 : 1.0));
  return {
    ci: {
      point,
      low: Number(clampScore(point - half).toFixed(2)),
      high: Number(clampScore(point + half).toFixed(2)),
    },
    tier: mapScoreToTier(point),
  };
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) {
        pivot = row;
      }
    }
    const tmp = M[col];
    M[col] = M[pivot];
    M[pivot] = tmp;

    const div = Math.abs(M[col][col]) < 1e-9 ? 1e-9 : M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= div;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => row[n]);
}
