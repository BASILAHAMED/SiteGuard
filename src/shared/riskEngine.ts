import type {
  BLETelemetryFrame,
  EnvironmentalObservation,
  FaultFlags,
  PPELevel,
  RiskAssessment,
  RiskTier,
  WorkerContext,
} from './types.ts';

/**
 * SiteGuard Risk Engine — Pure, testable, UI-independent physiological + environmental scoring.
 *
 * Primary Physiological Formula Citation:
 * Moran, D. S., Shitzer, A., & Pandolf, K. B. (1998).
 * "A physiological strain index to evaluate heat stress."
 * American Journal of Physiology-Regulatory, Integrative and Comparative Physiology,
 * 275(1), R129–R134. https://doi.org/10.1152/ajpregu.1998.275.1.R129
 *
 *   PSI = 5 * (HRt - HR0) / (HRmax - HR0) + 5 * (Tct - Tc0) / (39.5 - Tc0)
 *
 * Approximations & Calibration Notes:
 * - HRmax is estimated via Tanaka et al. (2001): 208 - 0.7 * ageYears.
 * - Tct (core temperature proxy) is approximated from non-invasive wrist/chest skin
 *   temperature under industrial PPE radiant load:
 *     Tc_proxy = 36.8 + (skinTempC - 33.5) * 0.68
 *   Explicitly documented as a non-invasive skin-to-core approximation; real deployment
 *   supports ingesting dual-heat-flux or ingestible/ear-canal core sensors over the
 *   same BLE contract.
 * - Environmental WBGT banding follows ACGIH TLV® and Action Limit guidelines
 *   (2023 Thermal Stress TLVs) adjusted for Clothing Adjustment Factors (CAF)
 *   and worker acclimatization days.
 */

export function estimateHrMax(ageYears: number): number {
  return Math.round(208 - 0.7 * Math.max(18, Math.min(70, ageYears)));
}

export function skinTempToCoreProxy(skinTempC: number): number {
  // Maps typical industrial working skin temperature (33.5°C baseline -> ~36.8°C core;
  // 37.5°C elevated skin -> ~39.52°C critical core proxy).
  const proxy = 36.8 + (skinTempC - 33.5) * 0.68;
  return Number(Math.max(36.2, Math.min(40.5, proxy)).toFixed(2));
}

export function getPpeClothingAdjustmentC(ppe: PPELevel): number {
  switch (ppe) {
    case 'Standard Coverall':
      return 0.0;
    case 'FR / Arc-Flash':
      return 2.0;
    case 'Chemical / Tyvek':
      return 4.0;
  }
}

/**
 * ACGIH WBGT limits (°C) for moderate-heavy construction work (~300–415 W metabolic rate).
 * Acclimatized workers (>= 7 days): TLV = 28.0°C, Action Limit = 25.0°C.
 * Unacclimatized workers (< 7 days): Action Limit drops to 25.0°C, TLV drops to 26.0°C.
 */
export function getAcgihLimits(acclimatizationDays: number): {
  actionLimitC: number;
  tlvLimitC: number;
} {
  const acclimatized = acclimatizationDays >= 7;
  return acclimatized
    ? { actionLimitC: 25.5, tlvLimitC: 28.5 }
    : { actionLimitC: 23.5, tlvLimitC: 26.0 };
}

export function computeMoranPsi(params: {
  hrBpm: number;
  skinTempC: number;
  hr0: number;
  tc0: number;
  ageYears: number;
}): { psi: number; tcProxyC: number; hrMax: number } {
  const hrMax = estimateHrMax(params.ageYears);
  const tcProxyC = skinTempToCoreProxy(params.skinTempC);

  const hrDenom = Math.max(20, hrMax - params.hr0);
  const tcDenom = Math.max(0.5, 39.5 - params.tc0);

  const hrTerm = 5 * ((params.hrBpm - params.hr0) / hrDenom);
  const tcTerm = 5 * ((tcProxyC - params.tc0) / tcDenom);

  const rawPsi = Math.max(0, hrTerm) + Math.max(0, tcTerm);
  const psi = Number(Math.max(0, Math.min(10, rawPsi)).toFixed(2));

  return { psi, tcProxyC, hrMax };
}

export const RISK_TIER_THRESHOLDS = {
  greenMax: 4.0,
  amberMin: 4.0,
  redMin: 7.0,
  maxScore: 10.0,
} as const;

export function mapScoreToTier(
  score: number,
  thresholds: { amberMin: number; redMin: number } = RISK_TIER_THRESHOLDS
): RiskTier {
  if (score >= thresholds.redMin) return 'Red';
  if (score >= thresholds.amberMin) return 'Amber';
  return 'Green';
}

export function computeEnvironmentRiskScore(
  effectiveWbgtC: number,
  acgihActionLimitC: number,
  acgihTlvLimitC: number,
  exertionIndex: number
): number {
  // Base environmental score: below action limit => 0..2.5;
  // between action limit and TLV => 2.5..5.5; above TLV => 5.5..9.5
  let wbgtScore = 0;
  if (effectiveWbgtC <= acgihActionLimitC) {
    wbgtScore = Math.max(0, 2.5 * (effectiveWbgtC / Math.max(1, acgihActionLimitC)));
  } else if (effectiveWbgtC <= acgihTlvLimitC) {
    const frac = (effectiveWbgtC - acgihActionLimitC) / Math.max(0.5, acgihTlvLimitC - acgihActionLimitC);
    wbgtScore = 2.5 + frac * 3.0;
  } else {
    const excess = effectiveWbgtC - acgihTlvLimitC;
    wbgtScore = Math.min(9.5, 5.5 + excess * 0.65);
  }

  // Exertion adjustment when known or estimated from role
  const exertionBoost = Math.max(0, (exertionIndex - 4) * 0.25);
  return Number(Math.max(0, Math.min(10, wbgtScore + exertionBoost)).toFixed(2));
}

export interface CustomWbgtThresholdPolicy {
  enabled: boolean;
  amberWbgtThresholdC: number;
  redWbgtThresholdC: number;
}

export function assessWorkerHeatRisk(
  context: WorkerContext,
  frame: BLETelemetryFrame,
  env: EnvironmentalObservation,
  faults: FaultFlags,
  customPolicy?: CustomWbgtThresholdPolicy
): RiskAssessment {
  const hrMax = estimateHrMax(context.ageYears);
  const caf = getPpeClothingAdjustmentC(context.ppeLevel);
  const effectiveWbgtC = Number((env.wbgtC + caf).toFixed(1));
  const { actionLimitC, tlvLimitC } = getAcgihLimits(context.acclimatizationDays);

  // Detect severe physiological fault requiring graceful degradation to environment-only scoring
  const severeFaults: string[] = [];
  if (faults.bleDisconnected || frame.rssiDbm <= -120) {
    severeFaults.push('BLE link disconnected');
  }
  if (faults.lowBattery || frame.batteryPct < 10) {
    severeFaults.push('Wearable battery critical (<10%)');
  }
  if (faults.sensorNoise || frame.signalQuality < 0.5) {
    severeFaults.push('High PPG/skin-thermistor sensor noise');
  }

  const isPhysiologicalDegraded = severeFaults.length > 0;
  const gpsDegraded = faults.gpsLoss || !frame.gpsFix;

  const envRiskScore = computeEnvironmentRiskScore(
    effectiveWbgtC,
    actionLimitC,
    tlvLimitC,
    isPhysiologicalDegraded ? 5 : frame.exertionIndex
  );

  const contributingFactors: string[] = [];
  if (effectiveWbgtC > tlvLimitC) {
    contributingFactors.push(
      `Effective WBGT ${effectiveWbgtC}°C exceeds ACGIH TLV (${tlvLimitC}°C) with ${context.ppeLevel} (+${caf}°C CAF)`
    );
  } else if (effectiveWbgtC > actionLimitC) {
    contributingFactors.push(
      `Effective WBGT ${effectiveWbgtC}°C exceeds ACGIH Action Limit (${actionLimitC}°C)`
    );
  }
  if (context.acclimatizationDays < 7) {
    contributingFactors.push(`Low heat acclimatization (${context.acclimatizationDays} days on site)`);
  }
  if (env.inUaeMiddayBreakWindow) {
    contributingFactors.push('Inside UAE Midday Working Break window (12:30–15:00 GST)');
  }

  if (isPhysiologicalDegraded) {
    const degradedReason = severeFaults.join('; ');
    contributingFactors.unshift(`Degraded to environment-only WBGT scoring (${degradedReason})`);
    if (gpsDegraded) {
      contributingFactors.push('GPS lock lost — using last known work zone');
    }

    // Conservative fallback score in environment-only mode
    let compositeScore = Number(Math.max(0, Math.min(10, envRiskScore)).toFixed(2));
    if (customPolicy?.enabled) {
      if (effectiveWbgtC >= customPolicy.redWbgtThresholdC) {
        compositeScore = Math.max(compositeScore, 7.2);
        contributingFactors.unshift(
          `Supervisor Red WBGT limit triggered (${effectiveWbgtC}°C >= ${customPolicy.redWbgtThresholdC}°C)`
        );
      } else if (effectiveWbgtC >= customPolicy.amberWbgtThresholdC) {
        compositeScore = Math.max(compositeScore, 4.5);
        contributingFactors.unshift(
          `Supervisor Amber WBGT threshold triggered (${effectiveWbgtC}°C >= ${customPolicy.amberWbgtThresholdC}°C)`
        );
      }
    }
    const tier = mapScoreToTier(compositeScore);

    return {
      workerId: context.workerId,
      timestamp: frame.timestamp,
      psi: null,
      tcProxyC: null,
      hrMaxEstimated: hrMax,
      effectiveWbgtC,
      acgihActionLimitC: actionLimitC,
      acgihTlvLimitC: tlvLimitC,
      envRiskScore,
      compositeScore,
      tier,
      scoringMode: 'environment_only_degraded',
      degradedReason,
      gpsDegraded,
      contributingFactors,
      recommendedAction: getRecommendedAction(tier, true, context.zone),
    };
  }

  // Healthy physiological stream: compute Moran et al. PSI
  const { psi, tcProxyC } = computeMoranPsi({
    hrBpm: frame.hrBpm,
    skinTempC: frame.skinTempC,
    hr0: context.hr0,
    tc0: context.tc0,
    ageYears: context.ageYears,
  });

  if (psi >= 7.0) {
    contributingFactors.unshift(`High Physiological Strain Index (PSI ${psi}/10)`);
  } else if (psi >= 4.0) {
    contributingFactors.unshift(`Moderate-high Physiological Strain Index (PSI ${psi}/10)`);
  }
  if (frame.exertionIndex >= 7) {
    contributingFactors.push(`Heavy physical exertion (${frame.exertionIndex}/10)`);
  }
  if (gpsDegraded) {
    contributingFactors.push('GPS lock lost — using last known work zone');
  }

  // Composite 0-10 score: 72% physiological PSI + 28% environmental WBGT exceedance,
  // with safety floor so an extreme PSI (>=7.5) never gets masked by mild weather.
  const blended = 0.72 * psi + 0.28 * envRiskScore;
  let compositeScore = Number(Math.max(psi >= 7.5 ? 7.2 : 0, Math.min(10, blended)).toFixed(2));
  if (customPolicy?.enabled) {
    if (effectiveWbgtC >= customPolicy.redWbgtThresholdC) {
      compositeScore = Math.max(compositeScore, 7.2);
      contributingFactors.unshift(
        `Supervisor Red WBGT limit triggered (${effectiveWbgtC}°C >= ${customPolicy.redWbgtThresholdC}°C)`
      );
    } else if (effectiveWbgtC >= customPolicy.amberWbgtThresholdC) {
      compositeScore = Math.max(compositeScore, 4.5);
      contributingFactors.unshift(
        `Supervisor Amber WBGT threshold triggered (${effectiveWbgtC}°C >= ${customPolicy.amberWbgtThresholdC}°C)`
      );
    }
  }
  const tier = mapScoreToTier(compositeScore);

  return {
    workerId: context.workerId,
    timestamp: frame.timestamp,
    psi,
    tcProxyC,
    hrMaxEstimated: hrMax,
    effectiveWbgtC,
    acgihActionLimitC: actionLimitC,
    acgihTlvLimitC: tlvLimitC,
    envRiskScore,
    compositeScore,
    tier,
    scoringMode: 'physiological_plus_env',
    degradedReason: null,
    gpsDegraded,
    contributingFactors,
    recommendedAction: getRecommendedAction(tier, false, context.zone),
  };
}

function getRecommendedAction(tier: RiskTier, degraded: boolean, zone: string): string {
  const modeSuffix = degraded ? ' (Env-only fallback active; check wearable unit).' : '.';
  switch (tier) {
    case 'Green':
      return `Continue normal pacing in ${zone}; drink 250 ml cool water every 20 min${modeSuffix}`;
    case 'Amber':
      return `Mandatory 15-min rest in shaded cooling station now and hydrate${modeSuffix}`;
    case 'Red':
      return `STOP WORK IMMEDIATELY: move to shaded/AC recovery area, remove heavy PPE, notify site medic${modeSuffix}`;
  }
}
