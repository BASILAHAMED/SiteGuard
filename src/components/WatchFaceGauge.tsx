import { RISK_TIER_THRESHOLDS, mapScoreToTier } from '../shared/riskEngine';
import type { WorkerStateSelf } from '../shared/types';

interface WatchFaceGaugeProps {
  workerState: WorkerStateSelf;
  aodMode: boolean;
  onToggleAod: () => void;
}

const CX = 160;
const CY = 160;
const ARC_RADIUS = 114;
const TICK_INNER_R = 131;
const TICK_OUTER_R = 143;
const SWEEP_START_DEG = -120;
const SWEEP_SPAN_DEG = 240;

function polarToCartesian(cx: number, cy: number, radius: number, angleDegFromTop: number) {
  const rad = ((angleDegFromTop - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  const start = polarToCartesian(cx, cy, radius, startAngleDeg);
  const end = polarToCartesian(cx, cy, radius, endAngleDeg);
  const largeArcFlag = Math.abs(endAngleDeg - startAngleDeg) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function WatchFaceGauge({ workerState, aodMode, onToggleAod }: WatchFaceGaugeProps) {
  const { context, assessment, forecast, faults, latestFrame, history, simulatedClockMin } = workerState;
  const thresholds = workerState.tierThresholds ?? RISK_TIER_THRESHOLDS;
  const maxScore = thresholds.maxScore || 10;

  const scoreToAngle = (score: number): number => {
    const clamped = Math.max(0, Math.min(maxScore, score));
    return SWEEP_START_DEG + (clamped / maxScore) * SWEEP_SPAN_DEG;
  };

  // Unit equivalence note:
  // `assessment.compositeScore` (0..10) and `forecast.psi15.point` (0..10 predicted compositeScore at t+15m
  // produced by `predictCompositeTrajectory(history)` over `history[].compositeScore`) share an identical
  // 0..10 scale, so both the active needle and the ghost needle map 1:1 across -120deg..+120deg.
  const mainScore = assessment.compositeScore;
  const mainAngle = scoreToAngle(mainScore);
  const mainTip = polarToCartesian(CX, CY, ARC_RADIUS - 14, mainAngle);
  const mainTail = polarToCartesian(CX, CY, 16, mainAngle + 180);

  const hasValidForecast = forecast.status === 'ready' && forecast.psi15 !== null;
  const ghostScore = hasValidForecast && forecast.psi15 ? forecast.psi15.point : null;
  const ghostAngle = ghostScore !== null ? scoreToAngle(ghostScore) : null;
  const ghostTip =
    ghostAngle !== null ? polarToCartesian(CX, CY, ARC_RADIUS - 16, ghostAngle) : null;

  const anyFaultActive =
    faults.bleDisconnected || faults.lowBattery || faults.sensorNoise || faults.gpsLoss;

  // Dynamic band angles driven by backend threshold constants
  const greenStartDeg = scoreToAngle(0);
  const greenEndDeg = scoreToAngle(thresholds.amberMin);
  const amberEndDeg = scoreToAngle(thresholds.redMin);
  const redEndDeg = scoreToAngle(maxScore);

  const activeTierWord =
    assessment.tier === 'Red'
      ? 'RED · STOP WORK'
      : assessment.tier === 'Amber'
        ? 'AMBER · REST IN SHADE'
        : 'GREEN · NOMINAL';

  const singleLetterTier =
    assessment.tier === 'Red' ? 'R' : assessment.tier === 'Amber' ? 'A' : 'G';

  // Micro bottom label strictly derived from API fields (never frontend-invented fault guesses)
  const bottomMicroLabel =
    assessment.scoringMode === 'environment_only_degraded' && assessment.degradedReason
      ? assessment.degradedReason
      : assessment.gpsDegraded
        ? `GPS SIGNAL LOST · ${context.zone}`
        : `${context.deviceId} · HR+SKIN · ${Math.round(latestFrame.signalQuality * 100)}%`;

  const forecastDelta =
    hasValidForecast && ghostScore !== null ? Number((ghostScore - mainScore).toFixed(1)) : null;
  const forecastArrow =
    forecastDelta === null ? '' : forecastDelta > 0.15 ? '↑' : forecastDelta < -0.15 ? '↓' : '→';

  const recentTicks = history.slice(-5);

  // Separate Always-On Display (AOD) low-power rendering branch:
  // Genuinely reduced-pixel SVG: monochrome grayscale only, thin 1.5px strokes,
  // zero outer history ticks, zero ghost needle, single-letter tier marker (G/A/R).
  if (aodMode) {
    return (
      <div
        data-testid="watchface-aod"
        className="relative flex flex-col items-center justify-center rounded-[28px] bg-black border border-neutral-800 px-6 py-6 text-neutral-300 select-none"
      >
        <div className="w-full flex items-center justify-between text-[11px] font-mono tabular-nums text-neutral-500 mb-2">
          <span>AOD · LOW POWER</span>
          <span>T+{simulatedClockMin}m</span>
        </div>

        <svg
          viewBox="0 0 320 300"
          className="w-full max-w-[320px] h-auto"
          role="img"
          aria-label={`Wearable Always-On Display: score ${mainScore.toFixed(1)} tier ${singleLetterTier}`}
        >
          {/* Thin 1.5px monochrome track arc */}
          <path
            d={describeArc(CX, CY, ARC_RADIUS, greenStartDeg, redEndDeg)}
            fill="none"
            stroke="#525252"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          {/* Thin 1.5px monochrome needle */}
          <line
            x1={mainTail.x}
            y1={mainTail.y}
            x2={mainTip.x}
            y2={mainTip.y}
            stroke="#d4d4d4"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r={4} fill="#d4d4d4" />

          {/* Large monochrome numeral */}
          <text
            x={CX}
            y={CY + 44}
            textAnchor="middle"
            className="font-mono tabular-nums"
            fill="#e5e5e5"
            fontSize="44"
            fontWeight="700"
          >
            {mainScore.toFixed(1)}
          </text>
          {/* Single-letter tier indicator */}
          <text
            x={CX}
            y={CY + 70}
            textAnchor="middle"
            className="font-mono"
            fill="#a3a3a3"
            fontSize="16"
            fontWeight="600"
            letterSpacing="0.16em"
          >
            {singleLetterTier}
          </text>
        </svg>

        <div className="mt-2 w-full flex items-center justify-between gap-3 pt-3 border-t border-neutral-900">
          <span className="text-[11px] font-mono text-neutral-500 truncate">
            {anyFaultActive ? bottomMicroLabel : `${context.deviceId} · AOD`}
          </span>
          <button
            type="button"
            onClick={onToggleAod}
            aria-pressed="true"
            className="px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 text-xs font-mono font-semibold cursor-pointer shrink-0"
          >
            Exit AOD
          </button>
        </div>
      </div>
    );
  }

  // Active Mode colors (desaturated grey when ANY device/GPS fault is active)
  const bandColors = anyFaultActive
    ? {
        green: '#475569',
        amber: '#64748b',
        red: '#94a3b8',
        needle: '#cbd5e1',
        pill: 'bg-slate-800 text-slate-200 border-slate-600',
      }
    : {
        green: '#10b981',
        amber: '#f59e0b',
        red: '#ef4444',
        needle:
          assessment.tier === 'Red'
            ? '#f87171'
            : assessment.tier === 'Amber'
              ? '#fbbf24'
              : '#34d399',
        pill:
          assessment.tier === 'Red'
            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
            : assessment.tier === 'Amber'
              ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };

  const tierTickColor = (score: number, degraded: boolean): string => {
    if (anyFaultActive || degraded) return '#64748b';
    const t = mapScoreToTier(score, thresholds);
    if (t === 'Red') return '#ef4444';
    if (t === 'Amber') return '#f59e0b';
    return '#10b981';
  };

  const redArcPulsing = !anyFaultActive && assessment.tier === 'Red';

  return (
    <div
      data-testid="watchface-active"
      data-fault-degraded={anyFaultActive ? 'true' : 'false'}
      className="relative flex flex-col items-center rounded-[28px] bg-[#0B1120] border-2 border-slate-800 px-6 py-5 text-slate-100 shadow-lg"
    >
      {/* Top Micro-Overlays: Simulated Clock Time (secondary) & Battery % */}
      <div className="w-full flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
        <span>T+{simulatedClockMin}m</span>
        <span className={faults.lowBattery ? 'text-amber-300 font-semibold' : ''}>
          BAT {latestFrame.batteryPct}%
        </span>
      </div>

      {/* Circular 240° Watch Dial */}
      <div className="relative w-full max-w-[320px] flex flex-col items-center mt-1">
        <svg
          viewBox="0 0 320 278"
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label={`Wearable strain gauge: ${mainScore.toFixed(1)} out of 10, ${activeTierWord}`}
        >
          {/* Dim background track */}
          <path
            d={describeArc(CX, CY, ARC_RADIUS, greenStartDeg, redEndDeg)}
            fill="none"
            stroke="#1e293b"
            strokeWidth={16}
            strokeLinecap="round"
          />

          {/* Three Colored Arc Bands driven by backend RISK_TIER_THRESHOLDS */}
          <path
            data-testid="arc-green"
            d={describeArc(CX, CY, ARC_RADIUS, greenStartDeg, greenEndDeg)}
            fill="none"
            stroke={bandColors.green}
            strokeWidth={11}
            strokeLinecap="butt"
          />
          <path
            data-testid="arc-amber"
            d={describeArc(CX, CY, ARC_RADIUS, greenEndDeg, amberEndDeg)}
            fill="none"
            stroke={bandColors.amber}
            strokeWidth={11}
            strokeLinecap="butt"
          />
          <path
            data-testid="arc-red"
            d={describeArc(CX, CY, ARC_RADIUS, amberEndDeg, redEndDeg)}
            fill="none"
            stroke={bandColors.red}
            strokeWidth={11}
            strokeLinecap="butt"
            className={redArcPulsing ? 'sg-red-arc-pulse' : undefined}
          />

          {/* Outer History Tick Ring (last 5 entries from worker's history array) */}
          <g data-testid="history-tick-ring">
            {recentTicks.map((pt, idx) => {
              const deg = scoreToAngle(pt.compositeScore);
              const inner = polarToCartesian(CX, CY, TICK_INNER_R, deg);
              const outer = polarToCartesian(CX, CY, TICK_OUTER_R + (idx === recentTicks.length - 1 ? 3 : 0), deg);
              return (
                <line
                  key={`${pt.minuteOffset}-${idx}`}
                  data-testid="history-tick"
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={tierTickColor(pt.compositeScore, pt.degraded)}
                  strokeWidth={idx === recentTicks.length - 1 ? 3.5 : 2.5}
                  strokeLinecap="round"
                  opacity={0.45 + ((idx + 1) / Math.max(1, recentTicks.length)) * 0.55}
                />
              );
            })}
          </g>

          {/* Scale boundary ticks (0, amberMin, redMin, 10) */}
          {[0, thresholds.amberMin, thresholds.redMin, maxScore].map((val) => {
            const deg = scoreToAngle(val);
            const p1 = polarToCartesian(CX, CY, ARC_RADIUS - 11, deg);
            const p2 = polarToCartesian(CX, CY, ARC_RADIUS + 9, deg);
            return (
              <line
                key={val}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="#0f172a"
                strokeWidth={2}
              />
            );
          })}

          {/* Ghost Needle (dashed, ~45% opacity) — STRICTLY omitted when insufficient_trend_data */}
          {hasValidForecast && ghostTip && (
            <g data-testid="ghost-needle" opacity={0.45}>
              <line
                x1={CX}
                y1={CY}
                x2={ghostTip.x}
                y2={ghostTip.y}
                stroke={anyFaultActive ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={3}
                strokeDasharray="5 4"
                strokeLinecap="round"
              />
              <circle
                cx={ghostTip.x}
                cy={ghostTip.y}
                r={3.5}
                fill={anyFaultActive ? '#94a3b8' : '#e2e8f0'}
              />
            </g>
          )}

          {/* Main Needle (current compositeScore) */}
          <g data-testid="main-needle">
            <line
              x1={mainTail.x}
              y1={mainTail.y}
              x2={mainTip.x}
              y2={mainTip.y}
              stroke={bandColors.needle}
              strokeWidth={4}
              strokeLinecap="round"
            />
            <circle cx={CX} cy={CY} r={7} fill="#0B1120" stroke={bandColors.needle} strokeWidth={3} />
          </g>

          {/* Center Large JetBrains Mono Numeral */}
          <text
            x={CX}
            y={CY + 46}
            textAnchor="middle"
            className="font-mono tabular-nums"
            fill={anyFaultActive ? '#cbd5e1' : '#ffffff'}
            fontSize="42"
            fontWeight="700"
          >
            {mainScore.toFixed(1)}
          </text>
          <text
            x={CX}
            y={CY + 64}
            textAnchor="middle"
            className="font-mono tabular-nums"
            fill="#94a3b8"
            fontSize="11"
          >
            {assessment.psi !== null
              ? `Composite ${mainScore.toFixed(1)}/10 · PSI ${assessment.psi.toFixed(1)}`
              : `Composite ${mainScore.toFixed(1)}/10 · PSI N/A (Env-Only)`}
          </text>
        </svg>

        {/* Tier Word Badge + t+15m Sub-line */}
        <div className="flex flex-col items-center -mt-3 mb-2 text-center">
          <div
            className={`px-3 py-1 rounded-md border text-xs font-mono font-bold tracking-wider ${bandColors.pill}`}
          >
            {activeTierWord}
          </div>

          <div
            data-testid="watchface-forecast-subline"
            className="mt-2 text-xs font-mono tabular-nums text-slate-300"
          >
            {hasValidForecast && ghostScore !== null ? (
              <span>
                t+15m: {ghostScore.toFixed(1)} {forecastArrow} (
                {forecastDelta !== null && forecastDelta >= 0 ? `+${forecastDelta.toFixed(1)}` : forecastDelta?.toFixed(1)})
              </span>
            ) : (
              <span className="text-amber-300">collecting trend data</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Micro-Label & Simulate AOD Control */}
      <div className="mt-2 w-full flex items-center justify-between gap-2 pt-3 border-t border-slate-800">
        <div
          data-testid="watchface-bottom-label"
          className={`text-[11px] font-mono leading-tight ${
            anyFaultActive ? 'text-amber-300 font-semibold' : 'text-slate-400'
          }`}
        >
          {bottomMicroLabel}
        </div>
        <button
          type="button"
          onClick={onToggleAod}
          aria-pressed="false"
          className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-mono font-medium cursor-pointer shrink-0 whitespace-nowrap"
        >
          Simulate AOD
        </button>
      </div>
    </div>
  );
}
