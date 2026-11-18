import { useCallback, useEffect, useState } from 'react';
import type { ForecastReplaySample, ForecastValidationReport } from '../shared/types';

interface ForecastValidationApiResponse {
  report: ForecastValidationReport;
  cohortMetadata: {
    source: string;
    generator: string;
    count: number;
  };
}

export function ForecastValidationPage() {
  const [data, setData] = useState<ForecastValidationApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverSample, setHoverSample] = useState<ForecastReplaySample | null>(null);

  const loadValidation = useCallback(async () => {
    try {
      const res = await fetch('/api/validation/forecast');
      const json = (await res.json()) as ForecastValidationApiResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadValidation();
  }, [loadValidation]);

  if (loading && !data) {
    return (
      <main className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="h-96 bg-white/10 rounded-xl animate-pulse" />
      </main>
    );
  }

  if (!data) return null;
  const { report } = data;

  // Dual-curve SVG Replay Chart (Actual vs t-15 Predicted Baseline + 90% CI + Ridge Ablation)
  const samples = report.sampleReplay;
  const width = 880;
  const height = 270;
  const padL = 44;
  const padR = 20;
  const padT = 18;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxMin = samples.length > 0 ? samples[samples.length - 1].minute : 240;
  const toX = (m: number) => padL + (m / Math.max(1, maxMin)) * plotW;
  const toY = (v: number) => padT + plotH - (Math.max(0, Math.min(10, v)) / 10) * plotH;

  const actualPath = samples
    .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(s.minute).toFixed(1)} ${toY(s.actualPsi).toFixed(1)}`)
    .join(' ');

  const predSamples = samples.filter((s) => s.predicted15Baseline !== null);
  const baselinePath = predSamples
    .map(
      (s, idx) =>
        `${idx === 0 ? 'M' : 'L'} ${toX(s.minute).toFixed(1)} ${toY(s.predicted15Baseline!).toFixed(1)}`
    )
    .join(' ');

  const ridgePath = samples
    .filter((s) => s.predicted15Ridge !== null)
    .map(
      (s, idx) =>
        `${idx === 0 ? 'M' : 'L'} ${toX(s.minute).toFixed(1)} ${toY(s.predicted15Ridge!).toFixed(1)}`
    )
    .join(' ');

  const ciPoints =
    predSamples.length > 1
      ? [
          ...predSamples.map((s) => `${toX(s.minute).toFixed(1)},${toY(s.predicted15High!).toFixed(1)}`),
          ...[...predSamples]
            .reverse()
            .map((s) => `${toX(s.minute).toFixed(1)},${toY(s.predicted15Low!).toFixed(1)}`),
        ].join(' ')
      : '';

  const rows = [
    report.baseline15,
    report.ridgeAblation15,
    report.baseline30,
    report.ridgeAblation30,
  ];

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Prospective Forecast Validation &amp; Model Ablation
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Walk-forward evaluation across {report.samplesEvaluated15} (t+15m) and {report.samplesEvaluated30} (t+30m) held-out predictions. Zero LLM calls used for numeric extrapolation.
        </p>
      </div>

      {/* Headline Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#141821] border border-white/10 rounded-xl p-5">
          <div className="text-xs text-slate-400">t+15m Trend MAE (PSI)</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-white mt-1">
            {report.baseline15.maePsi}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            RMSE {report.baseline15.rmsePsi} · Ridge MAE {report.ridgeAblation15.maePsi}
          </div>
        </div>

        <div className="bg-[#141821] border border-white/10 rounded-xl p-5">
          <div className="text-xs text-slate-400">t+15m Tier Accuracy</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-emerald-400 mt-1">
            {report.baseline15.tierAccuracyPct}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Ridge ablation: {report.ridgeAblation15.tierAccuracyPct}%
          </div>
        </div>

        <div className="bg-[#141821] border border-white/10 rounded-xl p-5">
          <div className="text-xs text-slate-400">t+30m Trend MAE (PSI)</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-white mt-1">
            {report.baseline30.maePsi}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            RMSE {report.baseline30.rmsePsi} · Ridge MAE {report.ridgeAblation30.maePsi}
          </div>
        </div>

        <div className="bg-[#141821] border border-white/10 rounded-xl p-5">
          <div className="text-xs text-slate-400">t+30m Tier Accuracy</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-white mt-1">
            {report.baseline30.tierAccuracyPct}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            90% CI Coverage: {report.baseline30.ci90CoveragePct}%
          </div>
        </div>
      </section>

      {/* Prospective Trajectory Replay Chart */}
      <section className="bg-[#141821] border border-white/10 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Prospective Replay: Predicted (15m prior) vs. Actual Realized Score ({report.sampleReplayTrajectoryId})
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Hover across minutes to inspect the exact t-15 forecast made before the strain materialized.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-slate-100 inline-block" /> Actual Score
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-amber-400 inline-block border-b border-dashed border-amber-400" />{' '}
              Damped Trend (t-15)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-sky-400 inline-block" /> Ridge Ablation (t-15)
            </span>
          </div>
        </div>

        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto cursor-crosshair"
            onMouseLeave={() => setHoverSample(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * width;
              const targetMin = ((relX - padL) / plotW) * maxMin;
              let best = samples[0];
              let bestDist = Infinity;
              for (const s of samples) {
                const d = Math.abs(s.minute - targetMin);
                if (d < bestDist) {
                  bestDist = d;
                  best = s;
                }
              }
              setHoverSample(best ?? null);
            }}
          >
            {/* Horizontal grid & thresholds */}
            {[0, 2, 4, 7, 10].map((val) => (
              <g key={val}>
                <line
                  x1={padL}
                  x2={width - padR}
                  y1={toY(val)}
                  y2={toY(val)}
                  stroke={val === 7 ? '#f87171' : val === 4 ? '#fbbf24' : 'rgba(255,255,255,0.08)'}
                  strokeDasharray={val === 4 || val === 7 ? '4 4' : undefined}
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={toY(val) + 3}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                  fill={val === 7 ? '#f87171' : val === 4 ? '#fbbf24' : '#94a3b8'}
                >
                  {val.toFixed(1)}
                </text>
              </g>
            ))}

            {/* 90% CI Shaded Band */}
            {ciPoints && <polygon points={ciPoints} fill="#f59e0b" fillOpacity={0.18} />}

            {/* Curves */}
            {ridgePath && <path d={ridgePath} fill="none" stroke="#38bdf8" strokeWidth={1.75} strokeDasharray="2 2" />}
            {baselinePath && <path d={baselinePath} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 3" />}
            {actualPath && <path d={actualPath} fill="none" stroke="#f1f5f9" strokeWidth={2.25} />}

            {/* Crosshair hover */}
            {hoverSample && (
              <g>
                <line
                  x1={toX(hoverSample.minute)}
                  x2={toX(hoverSample.minute)}
                  y1={padT}
                  y2={height - padB}
                  stroke="#64748b"
                  strokeWidth={1}
                />
                <circle
                  cx={toX(hoverSample.minute)}
                  cy={toY(hoverSample.actualPsi)}
                  r={4}
                  fill="#f1f5f9"
                />
                {hoverSample.predicted15Baseline !== null && (
                  <circle
                    cx={toX(hoverSample.minute)}
                    cy={toY(hoverSample.predicted15Baseline)}
                    r={4}
                    fill="#fbbf24"
                  />
                )}
              </g>
            )}

            {/* X-axis ticks */}
            {[0, 60, 120, 180, 240].map((m) => (
              <text
                key={m}
                x={toX(m)}
                y={height - 10}
                textAnchor="middle"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
                fill="#94a3b8"
              >
                T+{m}m
              </text>
            ))}
          </svg>

          {hoverSample && (
            <div className="mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-mono tabular-nums text-slate-300 flex flex-wrap gap-6">
              <span>Minute: T+{hoverSample.minute}m</span>
              <span>Actual Score: {hoverSample.actualPsi.toFixed(2)}</span>
              <span>
                t-15 Damped Trend:{' '}
                {hoverSample.predicted15Baseline !== null
                  ? `${hoverSample.predicted15Baseline.toFixed(2)} [${hoverSample.predicted15Low?.toFixed(2)}–${hoverSample.predicted15High?.toFixed(2)}]`
                  : 'Warmup'}
              </span>
              <span>
                t-15 Ridge Ablation:{' '}
                {hoverSample.predicted15Ridge !== null ? hoverSample.predicted15Ridge.toFixed(2) : 'Warmup'}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Ablation Comparison Table */}
      <section className="bg-[#141821] border border-white/10 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-1">
          Ablation Comparison: Interpretable Trend Baseline vs. Lagged Ridge Regressor
        </h2>
        <p className="text-xs text-slate-400 mb-4">{report.methodologyNote}</p>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-slate-400">
                <th className="py-2.5 pr-4 font-medium">Model</th>
                <th className="py-2.5 pr-4 font-medium text-right">Horizon</th>
                <th className="py-2.5 pr-4 font-medium text-right">Samples</th>
                <th className="py-2.5 pr-4 font-medium text-right">MAE (PSI)</th>
                <th className="py-2.5 pr-4 font-medium text-right">RMSE (PSI)</th>
                <th className="py-2.5 pr-4 font-medium text-right">Tier Accuracy</th>
                <th className="py-2.5 font-medium text-right">90% CI Coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono tabular-nums text-xs">
              {rows.map((r) => (
                <tr key={`${r.modelName}-${r.horizonMin}`}>
                  <td className="py-3 pr-4 font-sans font-semibold text-white">{r.modelName}</td>
                  <td className="py-3 pr-4 text-right text-slate-300">t+{r.horizonMin}m</td>
                  <td className="py-3 pr-4 text-right text-slate-400">{r.samplesEvaluated}</td>
                  <td className="py-3 pr-4 text-right font-semibold text-white">{r.maePsi}</td>
                  <td className="py-3 pr-4 text-right text-slate-300">{r.rmsePsi}</td>
                  <td className="py-3 pr-4 text-right font-semibold text-emerald-400">
                    {r.tierAccuracyPct}%
                  </td>
                  <td className="py-3 text-right text-slate-300">{r.ci90CoveragePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
