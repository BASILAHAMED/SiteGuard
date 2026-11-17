import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Coffee,
  Lock,
  OctagonAlert,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { TemperatureThresholdEditor } from '../components/TemperatureThresholdEditor';
import { formatTemperatureText, type TemperatureUnit } from '../shared/temperature';
import type {
  EnvironmentalObservation,
  IncidentLogEntry,
  ShiftRotationSuggestion,
  WorkerStatusPublic,
} from '../shared/types';

interface SupervisorSnapshot {
  crew: WorkerStatusPublic[];
  needsBreakQueue: WorkerStatusPublic[];
  rotationSuggestions: ShiftRotationSuggestion[];
  alerts: IncidentLogEntry[];
  env: EnvironmentalObservation;
  privacyEnforced: true;
}

const SUPERVISOR_CACHE_KEY = 'siteguard_last_supervisor';

function readCachedSupervisor(): SupervisorSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SUPERVISOR_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SupervisorSnapshot;
  } catch {
    return null;
  }
}

export function SupervisorPage({
  env,
  tempUnit,
}: {
  env?: EnvironmentalObservation | null;
  tempUnit: TemperatureUnit;
}) {
  const [data, setData] = useState<SupervisorSnapshot | null>(() => readCachedSupervisor());
  const [loading, setLoading] = useState(() => readCachedSupervisor() === null);
  const [busyWorker, setBusyWorker] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setData((prev) => prev ?? readCachedSupervisor());
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/supervisor/crew', {
        headers: { 'X-SiteGuard-Role': 'supervisor' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SupervisorSnapshot;
      try {
        window.localStorage.setItem(SUPERVISOR_CACHE_KEY, JSON.stringify(json));
      } catch {
        // Ignore storage write errors
      }
      setData(json);
    } catch {
      setData((prev) => prev ?? readCachedSupervisor());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot();
    const id = window.setInterval(() => {
      void fetchSnapshot();
    }, 8000);
    return () => window.clearInterval(id);
  }, [fetchSnapshot, env?.wbgtC, env?.edgeOfflineActive]);

  const handleAction = async (
    workerId: string,
    action: 'acknowledge' | 'order_break' | 'escalate' | 'apply_rotation'
  ) => {
    setBusyWorker(workerId);
    try {
      const res = await fetch('/api/supervisor/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SiteGuard-Role': 'supervisor',
        },
        body: JSON.stringify({ workerId, action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SupervisorSnapshot;
      try {
        window.localStorage.setItem(SUPERVISOR_CACHE_KEY, JSON.stringify(json));
      } catch {
        // Ignore storage write errors
      }
      setData(json);
    } catch {
      // Offline continuity: keep current crew state without throwing unhandled errors
    } finally {
      setBusyWorker(null);
    }
  };

  if (loading && !data) {
    return (
      <main className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="h-24 bg-slate-200/70 rounded-xl animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 bg-slate-200/70 rounded-xl animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (!data) return null;

  const tierStyle = (tier: WorkerStatusPublic['tier']) => {
    if (tier === 'Red') {
      return {
        border: 'border-rose-300 bg-rose-50/40',
        text: 'text-rose-800',
        Icon: OctagonAlert,
      };
    }
    if (tier === 'Amber') {
      return {
        border: 'border-amber-300 bg-amber-50/40',
        text: 'text-amber-800',
        Icon: AlertTriangle,
      };
    }
    return {
      border: 'border-slate-200 bg-white',
      text: 'text-emerald-800',
      Icon: ShieldCheck,
    };
  };

  const renderMiniSparkline = (actual: number[], proj: number[]) => {
    const pts = [...actual, ...proj.slice(1)];
    if (pts.length < 2) return null;
    const w = 136;
    const h = 34;
    const toX = (idx: number) => 4 + (idx / Math.max(1, pts.length - 1)) * (w - 8);
    const toY = (v: number) => h - 4 - (Math.max(0, Math.min(10, v)) / 10) * (h - 8);
    const split = Math.max(0, actual.length - 1);
    const actD = actual.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
    const projD =
      proj.length >= 2
        ? proj.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(split + i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ')
        : '';

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-36 h-8 shrink-0" aria-hidden="true">
        <line x1={0} x2={w} y1={toY(4)} y2={toY(4)} stroke="#d97706" strokeOpacity={0.35} strokeDasharray="2 2" />
        <line x1={0} x2={w} y1={toY(7)} y2={toY(7)} stroke="#dc2626" strokeOpacity={0.35} strokeDasharray="2 2" />
        <path d={actD} fill="none" stroke="#0f172a" strokeWidth={1.75} />
        {projD && <path d={projD} fill="none" stroke="#d97706" strokeWidth={1.75} strokeDasharray="3 2" />}
      </svg>
    );
  };

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-8">
      {/* Header + API Privacy Enforcement Notice */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Supervisor Crew Grid &amp; Dispatch
          </h1>
          <p className="text-sm text-slate-600 mt-1 flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              Privacy Enforced at API Layer: Raw vitals (HR, skin temp, exertion) are stripped from{' '}
              <code className="font-mono text-xs text-slate-800">/api/supervisor/crew</code>. Only risk tiers and actions are exposed.
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={fetchSnapshot}
          className="px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-800 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Crew</span>
        </button>
      </div>

      {/* Crew Status Grid (Tier Only — Zero Raw Vitals) */}
      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-4">
          Active Crew Status ({data.crew.length} Monitored Units)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.crew.map((w) => {
            const st = tierStyle(w.tier);
            const Icon = st.Icon;
            return (
              <div
                key={w.workerId}
                className={`rounded-xl border ${st.border} p-5 flex flex-col justify-between gap-4`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500">
                        {w.workerId} · {w.zone}
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mt-0.5">{w.roleLabel}</h3>
                    </div>
                    <div className={`flex items-center gap-1.5 text-xs font-mono font-bold ${st.text}`}>
                      <Icon className="w-4 h-4" />
                      <span>{w.tier.toUpperCase()}</span>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    {w.ppeLevel} · {w.acclimatizationDays}d acclim. · Breaks {w.breaksTakenTodayMin}m
                  </div>

                  {w.scoringMode === 'environment_only_degraded' && (
                    <div className="mt-2 text-xs font-medium text-amber-800 bg-amber-100/70 rounded px-2.5 py-1">
                      Env-Only Fallback ({w.faultSummary.join(', ')})
                    </div>
                  )}

                  {w.lastCheckIn?.status === 'help' && (
                    <div className="mt-2 text-xs font-semibold text-rose-800 bg-rose-100 rounded px-2.5 py-1">
                      WORKER REQUESTED HELP
                    </div>
                  )}
                </div>

                {/* Forecast Sparkline & Crossing ETA */}
                <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-600 font-mono tabular-nums">
                    {w.forecastStatus === 'ready' ? (
                      <>
                        <div>t+15m Tier: {w.predictedTier15}</div>
                        <div className="text-[11px] text-slate-500">
                          {w.projectedAmberCrossingMin === 0
                            ? 'Amber Active'
                            : w.projectedAmberCrossingMin !== null
                              ? `Amber ~${w.projectedAmberCrossingMin}m`
                              : 'Trend Stable'}
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-amber-700">Insufficient trend data</div>
                    )}
                  </div>
                  {renderMiniSparkline(w.sparklineComposite, w.sparklineProjected)}
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">{w.recommendedAction}</p>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-200/70">
                  <button
                    type="button"
                    disabled={busyWorker === w.workerId}
                    onClick={() => handleAction(w.workerId, 'order_break')}
                    className="flex-1 py-2 px-2.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    Order 15m Break
                  </button>
                  <button
                    type="button"
                    disabled={busyWorker === w.workerId}
                    onClick={() => handleAction(w.workerId, 'escalate')}
                    className="py-2 px-2.5 text-xs font-semibold border border-rose-300 text-rose-700 rounded-lg hover:bg-rose-50 cursor-pointer whitespace-nowrap"
                  >
                    Escalate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Supervisor Temperature Thresholds & Multilingual Alert Rules */}
      <TemperatureThresholdEditor tempUnit={tempUnit} onPolicySaved={fetchSnapshot} />

      {/* Bottom 2-Column Split: Priority Break Queue + Shift Rotation & Alert Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Who Needs a Break Now (Sorted Priority Queue) */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-slate-900">
            Who Needs a Break Now (Sorted by Risk &amp; Projected Crossing)
          </h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-3 font-medium">Unit</th>
                  <th className="py-2.5 pr-3 font-medium">Tier</th>
                  <th className="py-2.5 pr-3 font-medium">Forecast</th>
                  <th className="py-2.5 font-medium text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.needsBreakQueue.map((w) => (
                  <tr key={w.workerId} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-900">
                        {w.workerId} · {w.roleLabel}
                      </div>
                      <div className="text-xs text-slate-500">{w.zone}</div>
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs font-semibold">
                      <span
                        className={
                          w.tier === 'Red'
                            ? 'text-rose-700'
                            : w.tier === 'Amber'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                        }
                      >
                        {w.tier}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono tabular-nums text-xs text-slate-600">
                      {w.forecastStatus === 'ready'
                        ? w.projectedAmberCrossingMin === 0
                          ? 'Threshold crossed'
                          : w.projectedAmberCrossingMin !== null
                            ? `Amber in ~${w.projectedAmberCrossingMin}m`
                            : 'Stable'
                        : 'Insufficient trend'}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={busyWorker === w.workerId || w.acknowledged}
                          onClick={() => handleAction(w.workerId, 'acknowledge')}
                          className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          <span>{w.acknowledged ? 'Ack' : 'Acknowledge'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyWorker === w.workerId}
                          onClick={() => handleAction(w.workerId, 'order_break')}
                          className="px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 cursor-pointer flex items-center gap-1"
                        >
                          <Coffee className="w-3 h-3" />
                          <span>Break</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Shift / Rotation Suggestions + Live Alert Feed */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-slate-900">
              Shift &amp; Zone Rotation Suggestions
            </h2>
            {data.rotationSuggestions.length === 0 ? (
              <p className="text-xs text-slate-500 mt-3">
                All crew operating within nominal thermal margins; no rotation needed.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {data.rotationSuggestions.map((sug) => (
                  <li key={sug.id} className="pb-3 border-b border-slate-100 last:border-none last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {sug.workerId} · {sug.priority} Priority
                      </span>
                      <button
                        type="button"
                        disabled={busyWorker === sug.workerId}
                        onClick={() => handleAction(sug.workerId, 'apply_rotation')}
                        className="text-xs font-semibold text-slate-900 underline underline-offset-2 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                        <span>Apply Rotation</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-700 mt-1">{sug.suggestedAction}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {formatTemperatureText(sug.rationale, tempUnit)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-slate-900">Live Alert &amp; Fault Feed</h2>
            <ul className="mt-4 space-y-3 max-h-72 overflow-y-auto pr-1">
              {data.alerts.slice(0, 12).map((evt) => (
                <li key={evt.id} className="text-xs pb-2.5 border-b border-slate-100 last:border-none">
                  <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                    <span>
                      {evt.workerId} · {evt.severity}
                    </span>
                    <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="font-medium text-slate-800 mt-0.5">
                    {formatTemperatureText(evt.summary, tempUnit)}
                  </div>
                  <div className="text-slate-500 mt-0.5">{evt.actionTaken}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
