import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BatteryWarning,
  BluetoothOff,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  MapPinOff,
  OctagonAlert,
  Play,
  Radio,
  RotateCcw,
  Thermometer,
  Wrench,
} from 'lucide-react';
import { SparklineChart } from '../components/SparklineChart';
import { VoiceIncidentRecorder } from '../components/VoiceIncidentRecorder';
import { WatchFaceGauge } from '../components/WatchFaceGauge';
import { synthesizeGemma4EdgeObservation } from '../shared/edgeWeatherFallback';
import { predictCompositeTrajectory } from '../shared/forecastEngine';
import { assessWorkerHeatRisk } from '../shared/riskEngine';
import { formatTemperature, type TemperatureUnit } from '../shared/temperature';
import {
  LANGUAGE_LABELS,
  type BLETelemetryFrame,
  type EnvironmentalObservation,
  type FaultFlags,
  type SupportedLanguage,
  type WorkerStateSelf,
} from '../shared/types';

function readCachedWorkerState(workerId: string): WorkerStateSelf | null {
  try {
    const raw = window.localStorage.getItem(`siteguard_worker_state_${workerId}`);
    if (!raw) return null;
    return JSON.parse(raw) as WorkerStateSelf;
  } catch {
    return null;
  }
}

function persistWorkerState(state: WorkerStateSelf) {
  try {
    window.localStorage.setItem(
      `siteguard_worker_state_${state.context.workerId}`,
      JSON.stringify(state)
    );
  } catch {
    // Ignore storage write errors
  }
}

function buildColdOfflineWorkerState(
  workerId: string,
  activeEnv: EnvironmentalObservation
): WorkerStateSelf {
  const context: WorkerStateSelf['context'] = {
    workerId,
    deviceId: `BLE-BAND-${workerId.replace(/\D/g, '') || '101'}`,
    roleLabel: 'Steel Fixer',
    zone: 'Zone A · Rebar Deck',
    ppeLevel: 'Standard Coverall',
    acclimatizationDays: 3,
    ageYears: 29,
    hr0: 68,
    tc0: 36.7,
    preferredLanguage: 'en',
    plannedBreakTime: '12:30',
    hydrationCount: 2,
    breaksTakenTodayMin: 20,
  };
  const faults: FaultFlags = {
    bleDisconnected: false,
    lowBattery: false,
    sensorNoise: false,
    gpsLoss: false,
  };
  const frame: BLETelemetryFrame = {
    deviceId: context.deviceId,
    workerId,
    timestamp: new Date().toISOString(),
    hrBpm: 94,
    skinTempC: 34.1,
    exertionIndex: 5.5,
    batteryPct: 86,
    rssiDbm: -61,
    gpsFix: true,
    signalQuality: 0.97,
    simulatedClockMin: 12,
  };
  const assessment = assessWorkerHeatRisk(context, frame, activeEnv, faults);
  const history = [0, 3, 6, 9, 12].map((minOffset, idx) => ({
    minuteOffset: minOffset,
    timestamp: new Date(Date.now() - (4 - idx) * 180_000).toISOString(),
    psi: Number(Math.max(1.2, (assessment.psi ?? 3.2) - (4 - idx) * 0.25).toFixed(2)),
    compositeScore: Number(Math.max(1.5, assessment.compositeScore - (4 - idx) * 0.2).toFixed(2)),
    wbgtC: activeEnv.wbgtC,
    degraded: false,
  }));
  const forecast = predictCompositeTrajectory(history, 0.45);
  const copy = {
    headline:
      assessment.tier === 'Red'
        ? 'STOP WORK NOW — CRITICAL HEAT'
        : assessment.tier === 'Amber'
          ? 'REST IN SHADE — ELEVATED STRAIN'
          : 'SAFE TO WORK — STAY HYDRATED',
    explanation: `Gemma 4 Edge Local Inference active (${activeEnv.wbgtC}°C WBGT).`,
    action: assessment.recommendedAction,
    proactiveForecastNote:
      forecast.projectedAmberCrossingMin !== null && forecast.projectedAmberCrossingMin > 0
        ? `Edge projection: Amber risk anticipated in ~${forecast.projectedAmberCrossingMin} min.`
        : null,
    source: 'template_fallback' as const,
    cached: true,
  };
  return {
    context,
    latestFrame: frame,
    faults,
    assessment,
    forecast,
    history,
    alertTranslations: {
      en: copy,
      hi: copy,
      ur: copy,
      bn: copy,
      tl: copy,
    },
    lastCheckIn: null,
    supervisorDirective: null,
    simulatedClockMin: 12,
  };
}

function recomputeLocalWorkerEdgeState(
  prev: WorkerStateSelf,
  activeEnv: EnvironmentalObservation,
  nextFrame?: BLETelemetryFrame,
  appendSample = false
): WorkerStateSelf {
  const frame = nextFrame ?? prev.latestFrame;
  const assessment = assessWorkerHeatRisk(prev.context, frame, activeEnv, prev.faults);
  const nextHistory = [...prev.history];
  if (appendSample) {
    nextHistory.push({
      minuteOffset: frame.simulatedClockMin ?? prev.simulatedClockMin + 3,
      timestamp: frame.timestamp,
      psi: assessment.psi,
      compositeScore: assessment.compositeScore,
      wbgtC: activeEnv.wbgtC,
      degraded: assessment.scoringMode === 'environment_only_degraded',
    });
  } else if (nextHistory.length > 0) {
    const last = nextHistory[nextHistory.length - 1];
    nextHistory[nextHistory.length - 1] = {
      ...last,
      psi: assessment.psi,
      compositeScore: assessment.compositeScore,
      wbgtC: activeEnv.wbgtC,
      degraded: assessment.scoringMode === 'environment_only_degraded',
    };
  }
  const trimmedHistory = nextHistory.slice(-24);
  const forecast = predictCompositeTrajectory(trimmedHistory, 0.45);
  return {
    ...prev,
    latestFrame: frame,
    assessment,
    history: trimmedHistory,
    forecast,
    simulatedClockMin: frame.simulatedClockMin ?? prev.simulatedClockMin,
  };
}

interface WorkerPageProps {
  env: EnvironmentalObservation | null;
  tempUnit: TemperatureUnit;
}

interface WorkerOption {
  workerId: string;
  roleLabel: string;
  zone: string;
}

export function WorkerPage({ env, tempUnit }: WorkerPageProps) {
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('W-101');
  const [workerState, setWorkerState] = useState<WorkerStateSelf | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aodMode, setAodMode] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [showBleJson, setShowBleJson] = useState(false);

  // Local slider mirrors inside collapsed Developer / BLE Simulator drawer
  const [hrSlider, setHrSlider] = useState(120);
  const [skinSlider, setSkinSlider] = useState(35.0);
  const [exertionSlider, setExertionSlider] = useState(6.0);
  const debounceRef = useRef<number | null>(null);

  const getActiveOfflineEnv = useCallback(
    () => env ?? synthesizeGemma4EdgeObservation(null, 'Gemma 4 Edge local inference active'),
    [env]
  );

  const loadWorkerState = useCallback(
    async (workerId: string) => {
      const applyFallback = () => {
        const offlineEnv = getActiveOfflineEnv();
        const cached = readCachedWorkerState(workerId);
        const edgeState = cached
          ? recomputeLocalWorkerEdgeState(cached, offlineEnv)
          : buildColdOfflineWorkerState(workerId, offlineEnv);
        setError(null);
        setWorkerState(edgeState);
        setHrSlider(edgeState.latestFrame.hrBpm);
        setSkinSlider(edgeState.latestFrame.skinTempC);
        setExertionSlider(edgeState.latestFrame.exertionIndex);
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        applyFallback();
        setLoading(false);
        return;
      }

      try {
        setError(null);
        const res = await fetch(`/api/worker/${workerId}/state`);
        if (!res.ok) throw new Error('Failed to load worker telemetry');
        const data = (await res.json()) as { state: WorkerStateSelf };
        const syncedState =
          env?.edgeOfflineActive
            ? recomputeLocalWorkerEdgeState(data.state, env)
            : data.state;
        persistWorkerState(syncedState);
        setWorkerState(syncedState);
        setHrSlider(syncedState.latestFrame.hrBpm);
        setSkinSlider(syncedState.latestFrame.skinTempC);
        setExertionSlider(syncedState.latestFrame.exertionIndex);
      } catch {
        applyFallback();
      } finally {
        setLoading(false);
      }
    },
    [env, getActiveOfflineEnv]
  );

  useEffect(() => {
    fetch('/api/workers')
      .then((r) => r.json())
      .then((d: { workers: WorkerOption[] }) => {
        setWorkers(d.workers);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadWorkerState(selectedWorkerId);
  }, [selectedWorkerId, env?.wbgtC, env?.mode, env?.edgeOfflineActive, loadWorkerState]);

  const pushBleFrame = async (nextHr: number, nextSkin: number, nextExertion: number) => {
    if (!workerState) return;
    setUpdating(true);
    const payload: BLETelemetryFrame = {
      deviceId: workerState.context.deviceId,
      workerId: workerState.context.workerId,
      timestamp: new Date().toISOString(),
      hrBpm: nextHr,
      skinTempC: nextSkin,
      exertionIndex: nextExertion,
      batteryPct: workerState.faults.lowBattery ? 6 : workerState.latestFrame.batteryPct,
      rssiDbm: workerState.faults.bleDisconnected ? -999 : -60,
      gpsFix: !workerState.faults.gpsLoss,
      signalQuality: workerState.faults.sensorNoise ? 0.22 : 0.98,
      simulatedClockMin: workerState.simulatedClockMin + 3,
    };

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Offline edge fallback');
      }
      const res = await fetch('/api/ble/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('BLE ingestion failed');
      const data = (await res.json()) as { state: WorkerStateSelf };
      persistWorkerState(data.state);
      setWorkerState(data.state);
    } catch {
      const localNext = recomputeLocalWorkerEdgeState(
        workerState,
        getActiveOfflineEnv(),
        payload,
        true
      );
      persistWorkerState(localNext);
      setWorkerState(localNext);
    } finally {
      setUpdating(false);
    }
  };

  const handleSliderChange = (nextHr: number, nextSkin: number, nextExertion: number) => {
    setHrSlider(nextHr);
    setSkinSlider(nextSkin);
    setExertionSlider(nextExertion);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      pushBleFrame(nextHr, nextSkin, nextExertion);
    }, 240);
  };

  const handleFaultToggle = async (faultKey: keyof FaultFlags | 'clear_all', active: boolean) => {
    if (!workerState) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/worker/${workerState.context.workerId}/fault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faultKey, active }),
      });
      if (!res.ok) throw new Error('Fault toggle failed');
      const data = (await res.json()) as { state: WorkerStateSelf };
      persistWorkerState(data.state);
      setWorkerState(data.state);
      setHrSlider(data.state.latestFrame.hrBpm);
      setSkinSlider(data.state.latestFrame.skinTempC);
      setExertionSlider(data.state.latestFrame.exertionIndex);
    } catch {
      const nextFaults: FaultFlags =
        faultKey === 'clear_all'
          ? { bleDisconnected: false, lowBattery: false, sensorNoise: false, gpsLoss: false }
          : { ...workerState.faults, [faultKey]: active };
      const localNext = recomputeLocalWorkerEdgeState(
        { ...workerState, faults: nextFaults },
        getActiveOfflineEnv(),
        undefined,
        true
      );
      persistWorkerState(localNext);
      setWorkerState(localNext);
    } finally {
      setUpdating(false);
    }
  };

  const handleLanguageChange = async (language: SupportedLanguage) => {
    if (!workerState) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/worker/${workerState.context.workerId}/language`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      });
      if (!res.ok) throw new Error('Language switch failed');
      const data = (await res.json()) as { state: WorkerStateSelf };
      persistWorkerState(data.state);
      setWorkerState(data.state);
    } catch {
      const localNext: WorkerStateSelf = {
        ...workerState,
        context: { ...workerState.context, preferredLanguage: language },
      };
      persistWorkerState(localNext);
      setWorkerState(localNext);
    } finally {
      setUpdating(false);
    }
  };

  const [checkInSending, setCheckInSending] = useState<'okay' | 'help' | null>(null);

  const handleCheckIn = async (status: 'okay' | 'help') => {
    if (!workerState) return;
    setCheckInSending(status);
    setError(null);
    try {
      const res = await fetch(`/api/worker/${workerState.context.workerId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        throw new Error(`Check-in request failed (${res.status})`);
      }
      const data = (await res.json()) as { state: WorkerStateSelf };
      persistWorkerState(data.state);
      setWorkerState(data.state);
    } catch {
      const localNext: WorkerStateSelf = {
        ...workerState,
        lastCheckIn: { status, timestamp: new Date().toISOString() },
        supervisorDirective:
          status === 'help'
            ? 'SOS CACHED ON EDGE: Supervisor alert queued for sync; stop work and remain in shade.'
            : workerState.supervisorDirective,
      };
      persistWorkerState(localNext);
      setWorkerState(localNext);
    } finally {
      setCheckInSending(null);
    }
  };

  const handleSimStep = async (action: 'step_3m' | 'step_6m' | 'reset_cool') => {
    if (!workerState) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/worker/${workerState.context.workerId}/sim-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error('Sim step failed');
      const data = (await res.json()) as { state: WorkerStateSelf };
      persistWorkerState(data.state);
      setWorkerState(data.state);
      setHrSlider(data.state.latestFrame.hrBpm);
      setSkinSlider(data.state.latestFrame.skinTempC);
      setExertionSlider(data.state.latestFrame.exertionIndex);
    } catch {
      const nextFrame: BLETelemetryFrame =
        action === 'reset_cool'
          ? {
              ...workerState.latestFrame,
              hrBpm: workerState.context.hr0 + 26,
              skinTempC: 34.0,
              exertionIndex: 4.5,
              timestamp: new Date().toISOString(),
              simulatedClockMin: workerState.simulatedClockMin + 3,
            }
          : {
              ...workerState.latestFrame,
              hrBpm: Math.min(182, workerState.latestFrame.hrBpm + (action === 'step_6m' ? 12 : 6)),
              skinTempC: Number(
                Math.min(37.9, workerState.latestFrame.skinTempC + (action === 'step_6m' ? 0.48 : 0.24)).toFixed(2)
              ),
              exertionIndex: Number(
                Math.min(9.5, workerState.latestFrame.exertionIndex + (action === 'step_6m' ? 0.4 : 0.2)).toFixed(1)
              ),
              timestamp: new Date().toISOString(),
              simulatedClockMin: workerState.simulatedClockMin + (action === 'step_6m' ? 6 : 3),
            };
      const localNext = recomputeLocalWorkerEdgeState(
        workerState,
        getActiveOfflineEnv(),
        nextFrame,
        true
      );
      persistWorkerState(localNext);
      setWorkerState(localNext);
      setHrSlider(localNext.latestFrame.hrBpm);
      setSkinSlider(localNext.latestFrame.skinTempC);
      setExertionSlider(localNext.latestFrame.exertionIndex);
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !workerState) {
    return (
      <main className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 h-[560px] bg-slate-200/70 rounded-2xl animate-pulse" />
          <div className="lg:col-span-7 h-[560px] bg-slate-200/70 rounded-xl animate-pulse" />
        </div>
      </main>
    );
  }

  if (error || !workerState) {
    return (
      <main className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="bg-white border border-rose-200 rounded-xl p-6 text-sm text-rose-700">
          {error ?? 'Unable to load worker view.'}
        </div>
      </main>
    );
  }

  const { context, assessment, forecast, faults, latestFrame, alertTranslations } = workerState;
  const lang = context.preferredLanguage;
  const copy = alertTranslations[lang] ?? alertTranslations.en;
  const isRtl = lang === 'ur';

  return (
    <main className="max-w-[1280px] mx-auto px-6 py-8 space-y-8">
      {/* Page Title & Active Unit Selector */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Worker Wearable Safety Display
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {context.workerId} · {context.roleLabel} · {context.zone} · {context.ppeLevel} ·{' '}
            {context.acclimatizationDays}d acclimatized
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="worker-select" className="text-xs font-medium text-slate-600">
            Active Unit
          </label>
          <select
            id="worker-select"
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-900 cursor-pointer"
          >
            {(workers.length > 0
              ? workers
              : [{ workerId: 'W-101', roleLabel: 'Steel Fixer', zone: 'Zone A' }]
            ).map((w) => (
              <option key={w.workerId} value={w.workerId}>
                {w.workerId} — {w.roleLabel}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* PRIMARY STAGE: WATCH FACE DIAL + WORKER SAFETY GUIDANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: PRIMARY CIRCULAR WATCH FACE + CHECK-IN + VOICE INCIDENT */}
        <section className="lg:col-span-5 space-y-4">
          <WatchFaceGauge
            workerState={workerState}
            aodMode={aodMode}
            onToggleAod={() => setAodMode((v) => !v)}
          />

          {/* Worker Actions & Voice Safety Reporting Shell */}
          <div className="bg-[#0B1120] text-slate-100 rounded-2xl border border-slate-800 p-5 shadow-sm">
            {/* Compact Wearable Biometric Strip */}
            <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400 pb-3 border-b border-slate-800">
              <span>HR {latestFrame.hrBpm} bpm</span>
              <span>Skin {formatTemperature(latestFrame.skinTempC, tempUnit, 1)}</span>
              <span>{faults.bleDisconnected ? 'BLE OFF' : `${latestFrame.rssiDbm} dBm`}</span>
            </div>

            {/* Check-In Status Confirmation */}
            {workerState.lastCheckIn && (
              <div
                role="status"
                aria-live="polite"
                className={`mt-4 px-3.5 py-2.5 rounded-xl border text-xs ${
                  workerState.lastCheckIn.status === 'help'
                    ? 'bg-rose-950/90 border-rose-500 text-rose-100'
                    : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-100'
                }`}
              >
                <div className="font-mono font-bold tracking-wide">
                  {workerState.lastCheckIn.status === 'help'
                    ? 'SOS ACTIVE · SUPERVISOR & MEDIC NOTIFIED'
                    : 'CHECK-IN CONFIRMED · WORKER OKAY'}
                </div>
                <div className="mt-0.5 text-[11px] opacity-90 font-mono tabular-nums">
                  {workerState.lastCheckIn.status === 'help'
                    ? `Dispatched at ${new Date(workerState.lastCheckIn.timestamp).toLocaleTimeString()} · Stay in shade or tap "I'm Okay" to clear`
                    : `Recorded at ${new Date(workerState.lastCheckIn.timestamp).toLocaleTimeString()} · Hydration log: ${context.hydrationCount}`}
                </div>
              </div>
            )}

            {/* Quick Check-In Buttons: "I'm Okay" / "Need Help" */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={checkInSending !== null}
                onClick={() => handleCheckIn('okay')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{checkInSending === 'okay' ? 'Sending...' : "I'm Okay"}</span>
              </button>
              <button
                type="button"
                disabled={checkInSending !== null}
                onClick={() => handleCheckIn('help')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.99] disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <OctagonAlert className="w-4 h-4" />
                <span>{checkInSending === 'help' ? 'Alerting...' : 'Need Help'}</span>
              </button>
            </div>

            {/* Microphone Voice Incident Report Recorder */}
            <VoiceIncidentRecorder
              workerId={context.workerId}
              language={lang}
              onReportLogged={(updatedState) => setWorkerState(updatedState)}
            />
          </div>
        </section>

        {/* RIGHT COLUMN: MULTILINGUAL WORKER GUIDANCE + PREDICTIVE TRAJECTORY + CLOCK/LANGUAGE */}
        <section className="lg:col-span-7 space-y-6">
          {/* Degraded Mode Notices */}
          {assessment.scoringMode === 'environment_only_degraded' && (
            <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900">
              <strong className="font-semibold">DEGRADED · ENVIRONMENT-ONLY MODE:</strong>{' '}
              {assessment.degradedReason}. Scoring safely via outdoor WBGT ({formatTemperature(assessment.effectiveWbgtC, tempUnit, 1)} eff.).
            </div>
          )}
          {assessment.gpsDegraded && (
            <div className="px-4 py-3 rounded-xl bg-slate-100 border border-amber-300 text-xs text-slate-900">
              <strong className="font-semibold">DEGRADED · GPS SIGNAL LOST:</strong>{' '}
              Zone pinned to last verified beacon ({context.zone}).
            </div>
          )}

          {/* Multilingual Alert Card */}
          <div className="bg-[#0B1120] text-slate-100 rounded-2xl border border-slate-800 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Wearable Safety Guidance ({LANGUAGE_LABELS[lang].native})
                </span>
                {env?.edgeOfflineActive && (
                  <span className="px-2 py-0.5 rounded border border-amber-400/40 bg-amber-500/15 text-[10px] font-mono text-amber-200">
                    Gemma 4 Edge Local Inference
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
                {(Object.keys(LANGUAGE_LABELS) as SupportedLanguage[]).map((code) => (
                  <button
                    key={code}
                    type="button"
                    disabled={updating}
                    onClick={() => handleLanguageChange(code)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      lang === code
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {LANGUAGE_LABELS[code].native}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4" dir={isRtl ? 'rtl' : 'ltr'}>
              <div className="text-lg font-bold text-white leading-snug">{copy.headline}</div>
              <p className="text-sm text-slate-200 mt-1.5 leading-relaxed">{copy.action}</p>
              <p className="text-xs text-slate-400 mt-2">
                {copy.explanation} · {copy.source === 'gemini' ? 'Gemini Explainability' : 'Safety Template'}
                {copy.cached ? ' (cached)' : ''}
              </p>
            </div>

            {workerState.supervisorDirective && (
              <div className="mt-4 px-3 py-2.5 rounded-lg bg-sky-500/15 border border-sky-400/40 text-xs text-sky-100">
                <span className="font-semibold">Supervisor Order:</span> {workerState.supervisorDirective}
              </div>
            )}

            {/* Predictive Early-Warning Forecast & Sparkline */}
            <div className="mt-5 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-300">
                  30-Min Strain Trajectory Forecast
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {forecast.status === 'ready' && forecast.psi15
                    ? `t+15m: ${forecast.psi15.point.toFixed(1)} [${forecast.psi15.low.toFixed(1)}–${forecast.psi15.high.toFixed(1)}]`
                    : 'Insufficient trend data'}
                </span>
              </div>

              {forecast.status === 'ready' ? (
                <>
                  <SparklineChart history={workerState.history} forecast={forecast} dark height={116} />
                  {copy.proactiveForecastNote && (
                    <p
                      dir={isRtl ? 'rtl' : 'ltr'}
                      data-testid="proactive-forecast-note"
                      className="mt-2.5 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded-lg px-3 py-2 leading-relaxed"
                    >
                      {copy.proactiveForecastNote}
                    </p>
                  )}
                  <div className="mt-2.5 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
                    <span>
                      Amber ETA:{' '}
                      {forecast.projectedAmberCrossingMin === 0
                        ? 'Reached'
                        : forecast.projectedAmberCrossingMin !== null
                          ? `~${forecast.projectedAmberCrossingMin} min`
                          : 'Not projected'}
                    </span>
                    <span>
                      Red ETA:{' '}
                      {forecast.projectedRedCrossingMin === 0
                        ? 'Reached'
                        : forecast.projectedRedCrossingMin !== null
                          ? `~${forecast.projectedRedCrossingMin} min`
                          : 'Not projected'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-4 text-xs text-slate-300">
                  <div className="font-semibold text-amber-300">Insufficient Trend Data</div>
                  <p className="mt-1 text-slate-400">{forecast.reason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Simulated Clock Controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Advance simulated shift time to watch the watch face forecast &amp; crossing update live:
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleSimStep('step_3m')}
                  className="px-3 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>+3 min Step</span>
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleSimStep('step_6m')}
                  className="px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-200 cursor-pointer whitespace-nowrap"
                >
                  +6 min Step
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleSimStep('reset_cool')}
                  className="px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Cool</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* DEMOTED COLLAPSIBLE DRAWER: DEVELOPER / BLE SIMULATOR (Sliders + Fault Injection) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          aria-expanded={simulatorOpen}
          aria-controls="ble-simulator-drawer"
          onClick={() => setSimulatorOpen((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Wrench className="w-4 h-4 text-slate-600 shrink-0" />
            <div>
              <span className="text-sm font-semibold text-slate-900">
                Developer / BLE Simulator
              </span>
              <span className="ml-2 text-xs text-slate-500">
                Physiological telemetry sliders, presets, hardware fault injection &amp; BLE JSON contract
              </span>
            </div>
          </div>
          {simulatorOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
          )}
        </button>

        {simulatorOpen && (
          <div
            id="ble-simulator-drawer"
            data-testid="ble-simulator-drawer"
            className="p-6 pt-2 border-t border-slate-200 space-y-6"
          >
            {/* Physiological Stream Simulator Sliders */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Wearable Physiological Simulator
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Simulated stream calibrated to ACGIH/NIOSH thresholds · pushed via{' '}
                    <code className="font-mono text-slate-700">POST /api/ble/telemetry</code>
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setHrSlider(96);
                      setSkinSlider(34.1);
                      setExertionSlider(4.0);
                      pushBleFrame(96, 34.1, 4.0);
                    }}
                    className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md hover:bg-emerald-100 cursor-pointer"
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHrSlider(138);
                      setSkinSlider(36.0);
                      setExertionSlider(7.2);
                      pushBleFrame(138, 36.0, 7.2);
                    }}
                    className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 rounded-md hover:bg-amber-100 cursor-pointer"
                  >
                    Heat Ramp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHrSlider(164);
                      setSkinSlider(37.2);
                      setExertionSlider(8.8);
                      pushBleFrame(164, 37.2, 8.8);
                    }}
                    className="px-2.5 py-1 text-xs font-medium bg-rose-50 text-rose-800 border border-rose-200 rounded-md hover:bg-rose-100 cursor-pointer"
                  >
                    Critical
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Heart Rate Slider */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <label htmlFor="hr-slider" className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-slate-500" />
                      <span>Heart Rate</span>
                    </label>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {hrSlider} bpm
                    </span>
                  </div>
                  <input
                    id="hr-slider"
                    type="range"
                    min={65}
                    max={185}
                    step={1}
                    value={hrSlider}
                    onChange={(e) => handleSliderChange(Number(e.target.value), skinSlider, exertionSlider)}
                    className="w-full sg-slider"
                  />
                </div>

                {/* Skin Temp Slider */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <label htmlFor="skin-slider" className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Thermometer className="w-4 h-4 text-slate-500" />
                      <span>Skin Temp</span>
                    </label>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {formatTemperature(skinSlider, tempUnit, 1)}
                    </span>
                  </div>
                  <input
                    id="skin-slider"
                    type="range"
                    min={33.0}
                    max={38.2}
                    step={0.1}
                    value={skinSlider}
                    onChange={(e) => handleSliderChange(hrSlider, Number(e.target.value), exertionSlider)}
                    className="w-full sg-slider"
                  />
                </div>

                {/* Exertion Slider */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <label htmlFor="exertion-slider" className="font-medium text-slate-800 flex items-center gap-1.5">
                      <Radio className="w-4 h-4 text-slate-500" />
                      <span>Exertion (0–10)</span>
                    </label>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {exertionSlider.toFixed(1)}
                    </span>
                  </div>
                  <input
                    id="exertion-slider"
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    value={exertionSlider}
                    onChange={(e) => handleSliderChange(hrSlider, skinSlider, Number(e.target.value))}
                    className="w-full sg-slider"
                  />
                </div>
              </div>
            </div>

            {/* Fault Injection & Graceful Degradation */}
            <div className="pt-5 border-t border-slate-100">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Hardware Fault Injection &amp; Graceful Degradation
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Triggering BLE, battery, or sensor noise faults degrades scoring to environment-only WBGT and logs an audit event.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleFaultToggle('clear_all', false)}
                  className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Clear All Faults
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleFaultToggle('bleDisconnected', !faults.bleDisconnected)}
                  className={`min-h-[44px] px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    faults.bleDisconnected
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <BluetoothOff className="w-4 h-4 shrink-0" />
                  <span>Disconnect BLE</span>
                </button>

                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleFaultToggle('lowBattery', !faults.lowBattery)}
                  className={`min-h-[44px] px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    faults.lowBattery
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <BatteryWarning className="w-4 h-4 shrink-0" />
                  <span>Battery &lt;10%</span>
                </button>

                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleFaultToggle('sensorNoise', !faults.sensorNoise)}
                  className={`min-h-[44px] px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    faults.sensorNoise
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Activity className="w-4 h-4 shrink-0" />
                  <span>Sensor Noise</span>
                </button>

                <button
                  type="button"
                  disabled={updating}
                  onClick={() => handleFaultToggle('gpsLoss', !faults.gpsLoss)}
                  className={`min-h-[44px] px-3 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    faults.gpsLoss
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <MapPinOff className="w-4 h-4 shrink-0" />
                  <span>GPS Loss</span>
                </button>
              </div>

              {/* Hardware-Agnostic BLE API Contract Inspector */}
              <div className="mt-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBleJson((v) => !v)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>
                    {showBleJson ? 'Hide' : 'Inspect'} Hardware-Agnostic BLE Telemetry Contract (POST /api/ble/telemetry)
                  </span>
                </button>
                {showBleJson && (
                  <pre className="mt-3 p-3 bg-slate-950 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto leading-relaxed">
                    {JSON.stringify(latestFrame, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
