import { NavLink } from 'react-router-dom';
import { formatTemperature, type TemperatureUnit } from '../shared/temperature';
import type { EnvironmentalObservation } from '../shared/types';

interface TopNavProps {
  env: EnvironmentalObservation | null;
  onChangeEnvMode: (
    mode: 'historical_heatwave' | 'live_abu_dhabi',
    hourGst?: number,
    simulateOffline?: boolean
  ) => void;
  envLoading: boolean;
  onOpenDemo: () => void;
  tempUnit: TemperatureUnit;
  onToggleTempUnit: () => void;
}

export function TopNav({
  env,
  onChangeEnvMode,
  envLoading,
  onOpenDemo,
  tempUnit,
  onToggleTempUnit,
}: TopNavProps) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap shrink-0 py-1 text-sm font-medium transition-colors border-b-2 ${
      isActive
        ? 'border-slate-900 text-slate-900'
        : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
    }`;

  const isEdgeOffline =
    env?.feedStatus === 'gemma4_edge_offline_mode' || Boolean(env?.edgeOfflineActive);
  const isLiveFeed =
    env?.mode === 'live_abu_dhabi' && !isEdgeOffline;

  return (
    <div className="no-print bg-white border-b border-slate-200">
      {/* Strict 3-zone Top Bar Contract */}
      <header className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <NavLink
          to="/worker"
          className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          SiteGuard
        </NavLink>

        <nav aria-label="Primary" className="flex items-center gap-6 overflow-x-auto">
          <NavLink to="/worker" className={linkClass}>
            Worker
          </NavLink>
          <NavLink to="/supervisor" className={linkClass}>
            Supervisor
          </NavLink>
          <NavLink to="/compliance" className={linkClass}>
            Compliance
          </NavLink>
          <NavLink to="/validation" className={linkClass}>
            Backtest
          </NavLink>
          <NavLink to="/forecast-validation" className={linkClass}>
            Forecast
          </NavLink>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenDemo}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Demo Guide
          </button>
        </div>
      </header>

      {/* Unboxed Data Provenance & Environmental Feed Strip */}
      <div className="bg-slate-50 border-t border-slate-200">
        <div className="max-w-[1280px] mx-auto px-6 py-2 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2.5">
            {env && (
              <span
                aria-live="polite"
                data-testid="feed-mode-indicator"
                title={env.resilienceReason ?? env.station}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-semibold tracking-tight whitespace-nowrap ${
                  isEdgeOffline
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : isLiveFeed
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`w-2 h-2 rounded-full ${
                    isEdgeOffline
                      ? 'bg-amber-500 animate-pulse'
                      : isLiveFeed
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-slate-400'
                  }`}
                />
                <span>
                  {isEdgeOffline
                    ? 'Gemma 4 Edge Offline Mode'
                    : isLiveFeed
                      ? 'Live Abu Dhabi Feed'
                      : 'Historical Calibration'}
                </span>
              </span>
            )}
            <span className="font-semibold text-slate-800">Data Provenance:</span>
            <span>
              Environmental: {env ? env.sourceLabel : 'Loading Abu Dhabi station...'}
            </span>
            {env?.mode === 'live_abu_dhabi' && (
              <span className="font-mono text-[11px] text-slate-500">
                (24.45°N, 54.38°E{env.provider ? ` · ${env.provider}` : ''})
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span>
              Physiological: simulated, calibrated to ACGIH/NIOSH heat-stress thresholds
            </span>
          </div>

          {env && (
            <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-slate-700">
              <span>
                Air {formatTemperature(env.airTempC, tempUnit, 1)} · RH {env.relHumidityPct}% · WBGT{' '}
                <strong className="text-slate-900">{formatTemperature(env.wbgtC, tempUnit, 1)}</strong>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={tempUnit === 'F'}
                aria-label="Toggle temperature unit between Celsius and Fahrenheit"
                onClick={onToggleTempUnit}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-200/70 p-0.5 text-[11px] font-mono font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
              >
                <span
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    tempUnit === 'C' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  °C
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    tempUnit === 'F' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  °F
                </span>
              </button>
              <span aria-hidden="true">·</span>
              <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-md font-sans">
                <button
                  type="button"
                  disabled={envLoading}
                  onClick={() => onChangeEnvMode('historical_heatwave', env.hourGst, false)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    env.mode === 'historical_heatwave'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Heatwave CSV ({String(env.hourGst).padStart(2, '0')}:00)
                </button>
                <button
                  type="button"
                  disabled={envLoading}
                  onClick={() => onChangeEnvMode('live_abu_dhabi', undefined, false)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    isLiveFeed
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Live Abu Dhabi
                </button>
                <button
                  type="button"
                  disabled={envLoading}
                  onClick={() => onChangeEnvMode('live_abu_dhabi', undefined, true)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    isEdgeOffline
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Edge Offline
                </button>
              </div>
              {env.mode === 'historical_heatwave' && (
                <select
                  aria-label="Heatwave hour GST"
                  value={env.hourGst}
                  onChange={(e) => onChangeEnvMode('historical_heatwave', Number(e.target.value), false)}
                  className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-800 cursor-pointer"
                >
                  {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}:00 GST
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
