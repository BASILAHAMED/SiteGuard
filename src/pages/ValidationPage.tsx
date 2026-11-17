import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import type { BacktestReport } from '../shared/types';

interface BacktestApiResponse {
  report: BacktestReport;
  cohortMetadata: {
    source: 'SYNTHETIC_PHYSIOLOGICAL_COHORT';
    generator: 'deterministic_calibrated' | 'gemini_synthesized';
    count: number;
  };
}

export function ValidationPage() {
  const [data, setData] = useState<BacktestApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const loadBacktest = useCallback(async () => {
    try {
      const res = await fetch('/api/validation/backtest');
      const json = (await res.json()) as BacktestApiResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBacktest();
  }, [loadBacktest]);

  const handleRegenerate = async (mode: 'gemini' | 'deterministic') => {
    setRegenerating(true);
    try {
      const res = await fetch('/api/validation/generate-cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, count: mode === 'gemini' ? 14 : 24 }),
      });
      const json = await res.json();
      setData({
        report: json.backtest,
        cohortMetadata: json.cohortMetadata,
      });
    } finally {
      setRegenerating(false);
    }
  };

  if (loading && !data) {
    return (
      <main className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="h-96 bg-slate-200/70 rounded-xl animate-pulse" />
      </main>
    );
  }

  if (!data) return null;
  const { report, cohortMetadata } = data;

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Historical Heat-Wave Backtest Validation
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Cohort Source: <span className="font-mono text-xs font-semibold text-slate-800">{cohortMetadata.source}</span> ·{' '}
            Generator: {cohortMetadata.generator === 'gemini_synthesized' ? 'Gemini Synthesized' : 'Calibrated Physiological Model'} ·{' '}
            {report.cohortSize} worker-days ({report.totalMinutesEvaluated} simulated minutes)
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={regenerating}
            onClick={() => handleRegenerate('deterministic')}
            className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Calibrated Cohort (24d)</span>
          </button>
          <button
            type="button"
            disabled={regenerating}
            onClick={() => handleRegenerate('gemini')}
            className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-60 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{regenerating ? 'Synthesizing...' : 'Synthesize Cohort via Gemini'}</span>
          </button>
        </div>
      </div>

      {/* Primary Empirical Metrics Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Mean Alert Lead Time</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-slate-900 mt-1">
            {report.meanLeadTimeMin !== null ? `${report.meanLeadTimeMin}m` : 'N/A'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Before PSI &ge; 7.0 crossing (median {report.medianLeadTimeMin ?? 0}m)
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Sensitivity (Recall)</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-emerald-700 mt-1">
            {report.sensitivityPct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {report.detectedEventsCount}/{report.trueEventsCount} crossings detected
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">False-Alarm Rate</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-amber-700 mt-1">
            {report.falseAlarmRatePct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Specificity {report.specificityPct}%
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">Precision</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-slate-900 mt-1">
            {report.precisionPct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Positive predictive value</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-slate-500">F1 Score</div>
          <div className="text-3xl font-mono tabular-nums font-bold text-slate-900 mt-1">
            {report.f1Score}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Computed from replay</div>
        </div>
      </section>

      {/* Methodology & Limitations */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">Methodology &amp; Data Provenance</h2>
          <p className="text-sm text-slate-600 leading-relaxed mt-2">{report.methodologyNote}</p>
          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600 space-y-1">
            <div>
              <strong className="text-slate-900">Real Data:</strong> {report.weatherDataset}
            </div>
            <div>
              <strong className="text-slate-900">Synthetic Data:</strong>{' '}
              {cohortMetadata.source} ({cohortMetadata.count} worker-days, 08:00–12:00 GST)
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">Known Limitations</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 list-disc pl-5">
            {report.limitations.map((lim, idx) => (
              <li key={idx} className="leading-relaxed">
                {lim}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Trajectory-by-Trajectory Replay Table */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">
          Worker-Day Replay Outcomes ({report.trajectories.length} Trajectories)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2.5 pr-4 font-medium">Trajectory ID</th>
                <th className="py-2.5 pr-4 font-medium">Role &amp; PPE</th>
                <th className="py-2.5 pr-4 font-medium text-right">Acclim.</th>
                <th className="py-2.5 pr-4 font-medium text-right">First Alert</th>
                <th className="py-2.5 pr-4 font-medium text-right">True Crossing</th>
                <th className="py-2.5 pr-4 font-medium text-right">Lead Time</th>
                <th className="py-2.5 font-medium text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.trajectories.map((t) => (
                <tr key={t.trajectoryId} className="hover:bg-slate-50/70">
                  <td className="py-2.5 pr-4 font-mono font-semibold text-slate-900">
                    {t.trajectoryId}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">
                    {t.roleLabel} · {t.ppeLevel}
                  </td>
                  <td className="py-2.5 pr-4 font-mono tabular-nums text-right text-slate-600">
                    {t.acclimatizationDays}d
                  </td>
                  <td className="py-2.5 pr-4 font-mono tabular-nums text-right text-slate-700">
                    {t.firstAlertMin !== null ? `T+${t.firstAlertMin}m` : '—'}
                  </td>
                  <td className="py-2.5 pr-4 font-mono tabular-nums text-right text-slate-700">
                    {t.firstCrossingMin !== null ? `T+${t.firstCrossingMin}m` : 'None'}
                  </td>
                  <td className="py-2.5 pr-4 font-mono tabular-nums text-right font-semibold text-slate-900">
                    {t.leadTimeMin !== null ? `${t.leadTimeMin} min` : '—'}
                  </td>
                  <td
                    className={`py-2.5 text-right font-semibold ${
                      t.outcome === 'True Positive' || t.outcome === 'True Negative'
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {t.outcome}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
