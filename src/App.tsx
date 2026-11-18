import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DemoDrawer } from './components/DemoDrawer';
import { TopNav } from './components/TopNav';
import { CompliancePage } from './pages/CompliancePage';
import { ForecastValidationPage } from './pages/ForecastValidationPage';
import { SupervisorPage } from './pages/SupervisorPage';
import { ValidationPage } from './pages/ValidationPage';
import { WorkerPage } from './pages/WorkerPage';
import { synthesizeGemma4EdgeObservation } from './shared/edgeWeatherFallback';
import type { EnvironmentalObservation } from './shared/types';
import type { TemperatureUnit } from './shared/temperature';

const LAST_ENV_STORAGE_KEY = 'siteguard_last_env';

function readCachedEnv(): EnvironmentalObservation | null {
  try {
    const raw = window.localStorage.getItem(LAST_ENV_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EnvironmentalObservation;
  } catch {
    return null;
  }
}

function persistCachedEnv(obs: EnvironmentalObservation) {
  try {
    if (!obs.edgeOfflineActive) {
      window.localStorage.setItem(LAST_ENV_STORAGE_KEY, JSON.stringify(obs));
    }
  } catch {
    // Ignore storage write errors in restricted contexts
  }
}

export default function App() {
  const [env, setEnv] = useState<EnvironmentalObservation | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [tempUnit, setTempUnit] = useState<TemperatureUnit>(() => {
    try {
      return window.localStorage.getItem('siteguard_temp_unit') === 'F' ? 'F' : 'C';
    } catch {
      return 'C';
    }
  });

  const lastLiveEnvRef = useRef<EnvironmentalObservation | null>(readCachedEnv());
  const envRef = useRef<EnvironmentalObservation | null>(null);
  const simulateOfflineRef = useRef(false);

  const applyEnv = useCallback((nextEnv: EnvironmentalObservation) => {
    envRef.current = nextEnv;
    if (!nextEnv.edgeOfflineActive && nextEnv.mode === 'live_abu_dhabi') {
      lastLiveEnvRef.current = nextEnv;
    }
    persistCachedEnv(nextEnv);
    setEnv(nextEnv);
  }, []);

  const activateEdgeFallback = useCallback(
    (reason: string) => {
      const anchor = lastLiveEnvRef.current ?? envRef.current;
      const fallbackEnv = synthesizeGemma4EdgeObservation(anchor, reason);
      envRef.current = fallbackEnv;
      setEnv(fallbackEnv);
    },
    []
  );

  const handleToggleTempUnit = () => {
    setTempUnit((prev) => {
      const next: TemperatureUnit = prev === 'C' ? 'F' : 'C';
      try {
        window.localStorage.setItem('siteguard_temp_unit', next);
      } catch {
        // Ignore storage write errors in restricted contexts
      }
      return next;
    });
  };

  const loadEnv = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      activateEdgeFallback('Network offline — Gemma 4 Edge Offline Mode active');
      return;
    }
    try {
      const res = await fetch('/api/environment');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { current: EnvironmentalObservation };
      applyEnv(data.current);
    } catch {
      activateEdgeFallback('Live weather endpoint unreachable — Gemma 4 Edge Offline Mode active');
    }
  }, [activateEdgeFallback, applyEnv]);

  const refreshLiveEnv = useCallback(async () => {
    if (simulateOfflineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      activateEdgeFallback('Network offline — Gemma 4 Edge Offline Mode active');
      return;
    }
    try {
      const res = await fetch('/api/environment/live');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { current: EnvironmentalObservation };
      applyEnv(data.current);
    } catch {
      activateEdgeFallback('Live Abu Dhabi stream interrupted — Gemma 4 Edge Offline Mode active');
    }
  }, [activateEdgeFallback, applyEnv]);

  useEffect(() => {
    void loadEnv();
  }, [loadEnv]);

  // Continuous live telemetry stream polling (30s) when in Live Abu Dhabi Feed mode
  useEffect(() => {
    if (!env || env.mode !== 'live_abu_dhabi' || env.edgeOfflineActive || simulateOfflineRef.current) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshLiveEnv();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [env?.mode, env?.edgeOfflineActive, refreshLiveEnv]);

  // Seamless browser connectivity loss & auto-recovery handlers
  useEffect(() => {
    const onOffline = () => {
      activateEdgeFallback('Network connection dropped — Gemma 4 Edge Offline Mode active');
    };
    const onOnline = () => {
      if (!simulateOfflineRef.current && (envRef.current?.mode === 'live_abu_dhabi' || envRef.current?.edgeOfflineActive)) {
        void refreshLiveEnv();
      } else {
        void loadEnv();
      }
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [activateEdgeFallback, loadEnv, refreshLiveEnv]);

  const handleChangeEnvMode = async (
    mode: 'historical_heatwave' | 'live_abu_dhabi',
    hourGst?: number,
    simulateOffline = false
  ) => {
    simulateOfflineRef.current = simulateOffline;
    setEnvLoading(true);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (simulateOffline || mode === 'live_abu_dhabi') {
          activateEdgeFallback('Browser offline — Gemma 4 Edge Offline Mode active');
        }
        return;
      }

      const res = await fetch('/api/environment/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, hourGst, simulateOffline }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { current: EnvironmentalObservation };
      applyEnv(data.current);
    } catch {
      activateEdgeFallback('Edge failover engaged — Gemma 4 Edge Offline Mode active');
    } finally {
      setEnvLoading(false);
    }
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-white/5 text-white">
        <TopNav
          env={env}
          onChangeEnvMode={handleChangeEnvMode}
          envLoading={envLoading}
          onOpenDemo={() => setDemoOpen(true)}
          tempUnit={tempUnit}
          onToggleTempUnit={handleToggleTempUnit}
        />

        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Navigate to="/worker" replace />} />
            <Route path="/worker" element={<WorkerPage env={env} tempUnit={tempUnit} />} />
            <Route path="/supervisor" element={<SupervisorPage env={env} tempUnit={tempUnit} />} />
            <Route path="/compliance" element={<CompliancePage />} />
            <Route path="/validation" element={<ValidationPage />} />
            <Route path="/forecast-validation" element={<ForecastValidationPage />} />
            <Route path="*" element={<Navigate to="/worker" replace />} />
          </Routes>
        </div>

        <footer className="no-print border-t border-white/10 bg-[#141821] mt-12">
          <div className="max-w-[1280px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span>SiteGuard by GenOS Team · Future Health Digital Innovation Challenge 07</span>
            <span>
              Moran et al. (1998) PSI + ACGIH WBGT TLV · UAE Ministerial Resolution No. 44 (12:30–15:00 GST)
            </span>
          </div>
        </footer>

        <DemoDrawer open={demoOpen} onClose={() => setDemoOpen(false)} />
      </div>
    </BrowserRouter>
  );
}
