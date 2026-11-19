import { useState } from 'react';
import { Compass, Flame, Radio } from 'lucide-react';
import { SG_SURFACES } from '../shared/designTokens';
import { formatTemperature, type TemperatureUnit } from '../shared/temperature';
import type { EnvironmentalObservation, UaeSiteHubId } from '../shared/types';
import { UAE_SITE_HUBS } from '../shared/uaeWeatherData';

interface UaeSiteHubSimulatorProps {
  env: EnvironmentalObservation;
  tempUnit: TemperatureUnit;
  onHubUpdated?: (nextEnv: EnvironmentalObservation) => void;
}

const HUB_LIST = Object.values(UAE_SITE_HUBS);

export function UaeSiteHubSimulator({
  env,
  tempUnit,
  onHubUpdated,
}: UaeSiteHubSimulatorProps) {
  const [busyHub, setBusyHub] = useState<string | null>(null);
  const activeHubId: UaeSiteHubId = env.hubId ?? 'abu_dhabi_mussafah';

  const switchHub = async (
    hubId: UaeSiteHubId,
    options?: { hourGst?: number; mode?: 'historical_heatwave' | 'live_abu_dhabi' }
  ) => {
    setBusyHub(hubId);
    try {
      const res = await fetch('/api/environment/hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubId, ...options }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { current: EnvironmentalObservation };
      onHubUpdated?.(json.current);
    } catch {
      // Keep UI smooth offline
    } finally {
      setBusyHub(null);
    }
  };

  return (
    <section
      data-testid="uae-hub-simulator"
      className={`${SG_SURFACES.panel} p-5 space-y-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#787aff]" />
            <span>UAE Multi-Emirate Thermal Hub Simulation (Abu Dhabi &amp; Dubai)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Switch live station telemetry or simulate Dubai coastal/desert microclimates across active shifts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busyHub !== null}
            onClick={() =>
              void switchHub(activeHubId, { hourGst: 13, mode: 'historical_heatwave' })
            }
            className={`${SG_SURFACES.buttonSecondary} px-3 py-1.5 text-xs flex items-center gap-1.5`}
          >
            <Flame className="w-3.5 h-3.5 text-[#f59e0b]" />
            <span>Simulate 13:00 Peak Midday</span>
          </button>
          <button
            type="button"
            disabled={busyHub !== null}
            onClick={() => void switchHub(activeHubId, { mode: 'live_abu_dhabi' })}
            className={`${SG_SURFACES.buttonSecondary} px-3 py-1.5 text-xs flex items-center gap-1.5`}
          >
            <Radio className="w-3.5 h-3.5 text-[#10b981]" />
            <span>Sync Live Hub API</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {HUB_LIST.map((hub) => {
          const isSelected = hub.id === activeHubId;
          return (
            <button
              key={hub.id}
              type="button"
              disabled={busyHub !== null}
              data-testid={`hub-btn-${hub.id}`}
              onClick={() => void switchHub(hub.id, { hourGst: 13, mode: 'historical_heatwave' })}
              className={`text-left rounded-xl p-3.5 border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#787aff]/15 border-[#787aff]/60 shadow-[0_0_20px_rgba(120,122,255,0.16)]'
                  : 'bg-[#0c111d] border-white/10 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono font-semibold text-[#a5a7ff]">{hub.emirate}</span>
                <span className="font-mono tabular-nums text-[11px] text-slate-400">
                  {hub.lat.toFixed(2)}°N, {hub.lon.toFixed(2)}°E
                </span>
              </div>
              <div className="text-sm font-semibold text-white mt-1 truncate">{hub.shortLabel}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                {hub.microclimateNote}
              </div>
              {isSelected && (
                <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] font-mono tabular-nums text-emerald-300">
                  <span>ACTIVE STATION</span>
                  <span>WBGT {formatTemperature(env.wbgtC, tempUnit, 1)}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
