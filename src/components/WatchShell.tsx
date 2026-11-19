import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  BatteryWarning,
  Bell,
  BluetoothOff,
  ChevronRight,
  Droplets,
  Gauge,
  Layers,
  MapPinOff,
  Mic,
  Moon,
  OctagonAlert,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { TemperatureUnit } from '../shared/temperature';
import type { FaultFlags, RiskTier, WorkerStateSelf } from '../shared/types';
import type { WearableAlertStateId } from '../shared/wearableAlertSpecs';
import { AppCarousel } from './AppCarousel';
import { WatchFaceGauge } from './WatchFaceGauge';

export type WatchOverlayView =
  | 'gauge'
  | 'carousel'
  | 'app_grid'
  | 'notifications'
  | 'controls';

interface WatchShellProps {
  workerState: WorkerStateSelf;
  aodMode: boolean;
  onToggleAod: () => void;
  onCheckIn: (status: 'okay' | 'help') => Promise<void> | void;
  onToggleFault: (faultKey: keyof FaultFlags | 'clear_all', active: boolean) => Promise<void> | void;
  onNavigateForecast: () => void;
  voiceSheetOpen: boolean;
  onOpenVoiceSheet: () => void;
  onCloseVoiceSheet: () => void;
  voiceRecorderSlot: ReactNode;
  updating?: boolean;
  alertPreviewState?: WearableAlertStateId;
  tempUnit?: TemperatureUnit;
  edgeOfflineActive?: boolean;
}

export function WatchShell({
  workerState,
  aodMode,
  onToggleAod,
  onCheckIn,
  onToggleFault,
  onNavigateForecast,
  voiceSheetOpen,
  onOpenVoiceSheet,
  onCloseVoiceSheet,
  voiceRecorderSlot,
  updating = false,
  alertPreviewState = 'live',
  tempUnit = 'C',
  edgeOfflineActive = false,
}: WatchShellProps) {
  const [activeView, setActiveView] = useState<WatchOverlayView>('gauge');
  const [sosOpen, setSosOpen] = useState(false);
  const [holdingSide, setHoldingSide] = useState(false);
  const [slidePct, setSlidePct] = useState(0);
  const [draggingSos, setDraggingSos] = useState(false);
  const [alertBannerTier, setAlertBannerTier] = useState<'Amber' | 'Red' | null>(null);

  const prevTierRef = useRef<RiskTier>(workerState.assessment.tier);
  const holdTimerRef = useRef<number | null>(null);
  const sosTrackRef = useRef<HTMLDivElement | null>(null);
  const slidePctRef = useRef(0);

  const { context, assessment, faults } = workerState;

  // Slide down actionable notification banner on Amber/Red escalation transitions
  useEffect(() => {
    const nextTier = assessment.tier;
    const prevTier = prevTierRef.current;
    if (nextTier !== prevTier) {
      if (nextTier === 'Amber' || nextTier === 'Red') {
        setAlertBannerTier(nextTier);
      } else {
        setAlertBannerTier(null);
      }
      prevTierRef.current = nextTier;
    }
  }, [assessment.tier]);

  // Reset watch view when switching worker unit
  useEffect(() => {
    setActiveView('gauge');
    setSosOpen(false);
    setSlidePct(0);
    slidePctRef.current = 0;
  }, [context.workerId]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    };
  }, []);

  const handleCrownClick = () => {
    setSosOpen(false);
    if (voiceSheetOpen) {
      onCloseVoiceSheet();
    }
    setActiveView((prev) => (prev === 'app_grid' ? 'gauge' : 'app_grid'));
  };

  const beginSideHold = () => {
    if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
    setHoldingSide(true);
    holdTimerRef.current = window.setTimeout(() => {
      setHoldingSide(false);
      setSlidePct(0);
      slidePctRef.current = 0;
      setSosOpen(true);
    }, 600);
  };

  const cancelSideHold = () => {
    setHoldingSide(false);
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const updateSosDragFromClientX = (clientX: number) => {
    const track = sosTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const usable = Math.max(1, rect.width - 44);
    const raw = (clientX - rect.left - 22) / usable;
    const clamped = Math.max(0, Math.min(1, raw));
    slidePctRef.current = clamped;
    setSlidePct(clamped);
  };

  const finishSosDrag = () => {
    setDraggingSos(false);
    if (slidePctRef.current >= 0.94) {
      void onCheckIn('help');
      setSosOpen(false);
      setSlidePct(0);
      slidePctRef.current = 0;
    } else {
      // Partial drag safety guard: never triggers Need Help, snaps cleanly back to 0
      setSlidePct(0);
      slidePctRef.current = 0;
    }
  };

  const notifications = [
    ...(assessment.tier !== 'Green'
      ? [
          {
            id: 'tier-alert',
            label:
              assessment.tier === 'Red'
                ? 'Stop-Work Alert Active'
                : 'Elevated Heat Strain · Shade Break',
            sub: `Composite ${assessment.compositeScore.toFixed(1)}/10 · ${context.zone}`,
            badgeClass:
              assessment.tier === 'Red'
                ? 'bg-[#fa114f]/20 text-[#fa114f]'
                : 'bg-amber-500/20 text-amber-400',
            Icon: OctagonAlert,
          },
        ]
      : []),
    ...(workerState.supervisorDirective
      ? [
          {
            id: 'sup-dir',
            label: 'Supervisor Order',
            sub: workerState.supervisorDirective,
            badgeClass: 'bg-[#787aff]/20 text-[#787aff]',
            Icon: ShieldAlert,
          },
        ]
      : []),
    ...(workerState.lastCheckIn
      ? [
          {
            id: 'last-checkin',
            label:
              workerState.lastCheckIn.status === 'help'
                ? 'SOS Check-In Active'
                : 'Check-In Confirmed (OKAY)',
            sub: new Date(workerState.lastCheckIn.timestamp).toLocaleTimeString(),
            badgeClass:
              workerState.lastCheckIn.status === 'help'
                ? 'bg-[#fa114f]/20 text-[#fa114f]'
                : 'bg-emerald-500/20 text-emerald-400',
            Icon: Bell,
          },
        ]
      : []),
    {
      id: 'hydration-summary',
      label: `Hydration Log (${context.hydrationCount})`,
      sub: `${context.breaksTakenTodayMin}m shaded breaks completed today`,
      badgeClass: 'bg-sky-500/20 text-sky-400',
      Icon: Droplets,
    },
  ];

  return (
    <div
      data-testid="apple-watch-shell"
      className="relative mx-auto w-full max-w-[374px] pr-[16px] select-none font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Display','Plus_Jakarta_Sans',sans-serif]"
    >
      {/* Titanium / Brushed Space-Black Apple Watch Rounded-Rectangle Case */}
      <div className="relative rounded-[58px] bg-gradient-to-b from-zinc-600 via-zinc-800 to-zinc-700 p-[3px] shadow-2xl">
        {/* Physical Hardware Controls on Right Edge */}
        {/* Digital Crown (~30% down right edge, circular ridged dial) */}
        <button
          type="button"
          data-testid="digital-crown"
          aria-label="Digital Crown — Open App Grid"
          title="Digital Crown: Click to open App Grid"
          onClick={handleCrownClick}
          className="absolute top-[28%] -right-[14px] z-20 w-[14px] h-[54px] rounded-r-[6px] border border-l-0 border-zinc-500 bg-gradient-to-b from-zinc-400 via-zinc-600 to-zinc-500 shadow-md flex flex-col justify-evenly py-1.5 px-[2px] cursor-pointer hover:brightness-110 active:translate-x-[1px] transition-all"
        >
          <span className="block w-full h-[1.5px] bg-zinc-800/80 rounded-full" />
          <span className="block w-full h-[1.5px] bg-zinc-800/80 rounded-full" />
          <span className="block w-full h-[1.5px] bg-zinc-800/80 rounded-full" />
          <span className="block w-full h-[1.5px] bg-zinc-800/80 rounded-full" />
          <span className="block w-full h-[1.5px] bg-zinc-800/80 rounded-full" />
          <span className="block w-full h-[1.5px] bg-zinc-800/80 rounded-full" />
        </button>

        {/* Thin Side Button below Crown (600ms Hold triggers SOS Slide-to-Confirm) */}
        <button
          type="button"
          data-testid="watch-side-button"
          aria-label="Side Button — Click and hold 600ms for Emergency SOS"
          title="Side Button: Hold 600ms for SOS Slider"
          onPointerDown={beginSideHold}
          onPointerUp={cancelSideHold}
          onPointerLeave={cancelSideHold}
          onPointerCancel={cancelSideHold}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
              e.preventDefault();
              beginSideHold();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              cancelSideHold();
            }
          }}
          className={`absolute top-[52%] -right-[11px] z-20 w-[10px] h-[72px] rounded-r-[5px] border border-l-0 transition-all cursor-pointer ${
            holdingSide
              ? 'border-[#fa114f] bg-[#fa114f] scale-x-95'
              : 'border-zinc-600 bg-gradient-to-b from-zinc-500 via-zinc-700 to-zinc-600 hover:brightness-110'
          }`}
        />

        {/* Inner Bezel */}
        <div className="rounded-[55px] bg-[#101012] p-[11px]">
          {/* OLED Watch Screen (48px corner radius) */}
          <div className="relative rounded-[48px] bg-black overflow-hidden border border-white/10 min-h-[430px] flex flex-col justify-between">
            {/* Top Swipe/Tap Handle -> Notification Center */}
            <button
              type="button"
              data-testid="watch-top-trigger"
              aria-label="Open Watch Notification Center"
              onClick={() =>
                setActiveView((prev) => (prev === 'notifications' ? 'gauge' : 'notifications'))
              }
              className="w-full pt-2.5 pb-1.5 px-6 flex items-center justify-center gap-2 text-[10px] font-medium text-neutral-400 hover:text-white cursor-pointer shrink-0 z-10"
            >
              <span className="w-8 h-[3px] rounded-full bg-neutral-700" />
              {assessment.tier !== 'Green' && (
                <span
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full ${
                    assessment.tier === 'Red' ? 'bg-[#fa114f]' : 'bg-amber-400'
                  }`}
                />
              )}
            </button>

            {/* Preview State Watch Banners (State 1 Amber Forecast / State 4 SOS Active) */}
            {alertPreviewState === 'amber_forecast' && !sosOpen && (
              <div
                data-testid="watch-spec-banner-amber"
                className="mx-3 mb-1.5 rounded-[20px] bg-amber-500/15 border border-amber-400/70 px-3 py-2 z-20"
              >
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300">
                  Amber In ~1 min
                </div>
                <div className="text-[11px] text-amber-100 leading-snug mt-0.5">
                  Projected by trend forecast. Start break early
                </div>
              </div>
            )}

            {alertPreviewState === 'sos_active' && !sosOpen && (
              <div
                data-testid="watch-spec-banner-sos"
                className="mx-3 mb-1.5 rounded-[20px] border border-[#fa114f] px-3 py-2 z-20 sg-sos-flash"
              >
                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                  <OctagonAlert className="w-3.5 h-3.5 text-[#ff8aa8] shrink-0" />
                  <span>SOS ACTIVE — SUPERVISOR &amp; MEDIC NOTIFIED</span>
                </div>
              </div>
            )}

            {/* Sliding-Down Amber / Red Notification Banner (Live Telemetry Mode) */}
            {alertPreviewState === 'live' && alertBannerTier && !sosOpen && (
              <div
                data-testid="watch-alert-banner"
                className={`mx-3 mb-1.5 rounded-[22px] bg-[#212121] border px-3.5 py-2.5 shadow-lg z-20 transition-all duration-200 ${
                  alertBannerTier === 'Red' ? 'border-[#fa114f]' : 'border-amber-400/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[11px] font-bold tracking-wide uppercase ${
                      alertBannerTier === 'Red' ? 'text-[#fa114f]' : 'text-amber-300'
                    }`}
                  >
                    {alertBannerTier === 'Red' ? 'STOP WORK ALERT' : 'SHADE REST ORDER'}
                  </span>
                  <button
                    type="button"
                    aria-label="Dismiss watch alert banner"
                    onClick={() => setAlertBannerTier(null)}
                    className="p-0.5 text-neutral-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    data-testid="watch-banner-okay"
                    aria-label="Watch Banner: Confirm Safe"
                    onClick={() => {
                      setAlertBannerTier(null);
                      void onCheckIn('okay');
                    }}
                    className="py-1.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    I&apos;m Okay
                  </button>
                  <button
                    type="button"
                    data-testid="watch-banner-help"
                    aria-label="Watch Banner: Dispatch Medic"
                    onClick={() => {
                      setAlertBannerTier(null);
                      void onCheckIn('help');
                    }}
                    className="py-1.5 px-2 rounded-xl bg-[#fa114f] hover:brightness-110 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Need Help
                  </button>
                </div>
              </div>
            )}

            {/* Primary Screen Area */}
            <div className="flex-1 flex flex-col justify-center">
              {activeView === 'gauge' && (
                <WatchFaceGauge
                  workerState={workerState}
                  aodMode={aodMode}
                  onToggleAod={onToggleAod}
                  embedded
                  onOpenCarousel={aodMode ? undefined : () => setActiveView('carousel')}
                  alertPreviewState={alertPreviewState}
                  tempUnit={tempUnit}
                  edgeOfflineActive={edgeOfflineActive}
                />
              )}

              {activeView === 'carousel' && (
                <AppCarousel
                  workerState={workerState}
                  onClose={() => setActiveView('gauge')}
                  onNavigateForecast={onNavigateForecast}
                />
              )}

              {activeView === 'app_grid' && (
                <div
                  data-testid="watch-app-grid"
                  className="px-4 py-3 flex flex-col items-center justify-center min-h-[360px]"
                >
                  <div className="text-[11px] font-semibold text-[#787aff] uppercase tracking-wider mb-3">
                    Watch Apps
                  </div>
                  <div className="grid grid-cols-3 gap-3.5">
                    <button
                      type="button"
                      onClick={() => setActiveView('gauge')}
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <span className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Gauge className="w-6 h-6" />
                      </span>
                      <span className="text-[10px] text-neutral-300">Heat Gauge</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveView('carousel')}
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <span className="w-14 h-14 rounded-full bg-[#787aff]/25 border border-[#787aff] text-[#787aff] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Layers className="w-6 h-6" />
                      </span>
                      <span className="text-[10px] text-neutral-300">Cards</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveView('gauge');
                        onOpenVoiceSheet();
                      }}
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <span className="w-14 h-14 rounded-full bg-sky-500/20 border border-sky-400/50 text-sky-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Mic className="w-6 h-6" />
                      </span>
                      <span className="text-[10px] text-neutral-300">Voice Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveView('notifications')}
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <span className="w-14 h-14 rounded-full bg-[#fa114f]/20 border border-[#fa114f]/60 text-[#fa114f] flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Bell className="w-6 h-6" />
                      </span>
                      <span className="text-[10px] text-neutral-300">Alerts</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void onCheckIn('okay');
                        setActiveView('gauge');
                      }}
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <span className="w-14 h-14 rounded-full bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <Droplets className="w-6 h-6" />
                      </span>
                      <span className="text-[10px] text-neutral-300">Hydrate Log</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveView('controls')}
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <span className="w-14 h-14 rounded-full bg-[#212121] border border-neutral-600 text-neutral-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                        <SlidersHorizontal className="w-6 h-6" />
                      </span>
                      <span className="text-[10px] text-neutral-300">Controls</span>
                    </button>
                  </div>
                </div>
              )}

              {activeView === 'notifications' && (
                <div
                  data-testid="watch-notification-center"
                  className="px-3.5 py-2 flex flex-col h-[360px]"
                >
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-white">Notifications</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('gauge')}
                      className="text-[11px] font-medium text-[#787aff] cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {notifications.map((item) => {
                      const Icon = item.Icon;
                      return (
                        <div
                          key={item.id}
                          className="rounded-[22px] bg-[#212121] border border-white/5 px-3.5 py-2.5 flex items-center gap-3"
                        >
                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.badgeClass}`}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold text-white truncate">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-neutral-400 line-clamp-2">
                              {item.sub}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeView === 'controls' && (
                <div
                  data-testid="watch-control-center"
                  className="px-3.5 py-2 flex flex-col h-[360px]"
                >
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-semibold text-white">Control Center</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('gauge')}
                      className="text-[11px] font-medium text-[#787aff] cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={updating}
                      aria-label="Watch Control: Toggle BLE Link"
                      onClick={() => void onToggleFault('bleDisconnected', !faults.bleDisconnected)}
                      className={`rounded-[22px] p-3 flex flex-col items-start gap-2 border cursor-pointer transition-colors ${
                        faults.bleDisconnected
                          ? 'bg-[#fa114f]/25 border-[#fa114f] text-white'
                          : 'bg-[#212121] border-white/5 text-neutral-200 hover:bg-neutral-800'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          faults.bleDisconnected
                            ? 'bg-[#fa114f] text-white'
                            : 'bg-neutral-700 text-neutral-200'
                        }`}
                      >
                        <BluetoothOff className="w-4 h-4" />
                      </span>
                      <span className="text-[11px] font-semibold">BLE Fault</span>
                    </button>

                    <button
                      type="button"
                      disabled={updating}
                      aria-label="Watch Control: Toggle Low Battery"
                      onClick={() => void onToggleFault('lowBattery', !faults.lowBattery)}
                      className={`rounded-[22px] p-3 flex flex-col items-start gap-2 border cursor-pointer transition-colors ${
                        faults.lowBattery
                          ? 'bg-amber-500/25 border-amber-400 text-white'
                          : 'bg-[#212121] border-white/5 text-neutral-200 hover:bg-neutral-800'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          faults.lowBattery
                            ? 'bg-amber-500 text-black'
                            : 'bg-neutral-700 text-neutral-200'
                        }`}
                      >
                        <BatteryWarning className="w-4 h-4" />
                      </span>
                      <span className="text-[11px] font-semibold">Battery &lt;10%</span>
                    </button>

                    <button
                      type="button"
                      disabled={updating}
                      aria-label="Watch Control: Toggle Sensor Interference"
                      onClick={() => void onToggleFault('sensorNoise', !faults.sensorNoise)}
                      className={`rounded-[22px] p-3 flex flex-col items-start gap-2 border cursor-pointer transition-colors ${
                        faults.sensorNoise
                          ? 'bg-amber-500/25 border-amber-400 text-white'
                          : 'bg-[#212121] border-white/5 text-neutral-200 hover:bg-neutral-800'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          faults.sensorNoise
                            ? 'bg-amber-500 text-black'
                            : 'bg-neutral-700 text-neutral-200'
                        }`}
                      >
                        <Activity className="w-4 h-4" />
                      </span>
                      <span className="text-[11px] font-semibold">Sensor Noise</span>
                    </button>

                    <button
                      type="button"
                      disabled={updating}
                      aria-label="Watch Control: Toggle GPS Beacon"
                      onClick={() => void onToggleFault('gpsLoss', !faults.gpsLoss)}
                      className={`rounded-[22px] p-3 flex flex-col items-start gap-2 border cursor-pointer transition-colors ${
                        faults.gpsLoss
                          ? 'bg-[#787aff]/25 border-[#787aff] text-white'
                          : 'bg-[#212121] border-white/5 text-neutral-200 hover:bg-neutral-800'
                      }`}
                    >
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          faults.gpsLoss
                            ? 'bg-[#787aff] text-white'
                            : 'bg-neutral-700 text-neutral-200'
                        }`}
                      >
                        <MapPinOff className="w-4 h-4" />
                      </span>
                      <span className="text-[11px] font-semibold">GPS Loss</span>
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={updating}
                      aria-label="Watch Control: Reset Device Alerts"
                      onClick={() => void onToggleFault('clear_all', false)}
                      className="flex-1 py-2 px-3 rounded-[22px] bg-[#212121] border border-white/10 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-800 cursor-pointer"
                    >
                      Clear Faults
                    </button>
                    <button
                      type="button"
                      aria-label="Control Center: Toggle Always-On Display"
                      onClick={() => {
                        onToggleAod();
                        setActiveView('gauge');
                      }}
                      className="py-2 px-3 rounded-[22px] bg-[#212121] border border-white/10 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Moon className="w-3.5 h-3.5" />
                      <span>AOD</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Control Center Trigger Bar */}
            <button
              type="button"
              data-testid="watch-bottom-trigger"
              aria-label="Open Watch Control Center"
              onClick={() =>
                setActiveView((prev) => (prev === 'controls' ? 'gauge' : 'controls'))
              }
              className="w-full pt-1.5 pb-3 px-6 flex items-center justify-center gap-2 text-[10px] text-neutral-500 hover:text-neutral-200 cursor-pointer shrink-0 z-10"
            >
              <span className="w-10 h-[3px] rounded-full bg-neutral-700" />
            </button>

            {/* Siri-Style Voice Bottom Sheet Overlay inside OLED Watch Screen */}
            {voiceSheetOpen && (
              <div
                data-testid="watch-voice-sheet"
                className="absolute inset-x-0 bottom-0 z-30 rounded-t-[28px] bg-[#16161a]/95 backdrop-blur-md border-t border-[#787aff]/60 px-4 pt-3 pb-4 shadow-2xl"
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#787aff] animate-pulse" />
                    <span className="text-[11px] font-semibold text-[#787aff] tracking-wide uppercase">
                      Siri Voice Intake
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Close voice sheet"
                    onClick={onCloseVoiceSheet}
                    className="p-1 rounded-full bg-[#212121] text-neutral-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-[350px] overflow-y-auto">{voiceRecorderSlot}</div>
              </div>
            )}

            {/* Side-Button Hold SOS Slide-to-Confirm Overlay */}
            {sosOpen && (
              <div
                data-testid="watch-sos-overlay"
                className="absolute inset-0 z-40 bg-black/95 px-5 py-6 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase text-[#fa114f]">
                    <OctagonAlert className="w-4 h-4" />
                    <span>Emergency SOS</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Cancel Emergency SOS"
                    onClick={() => {
                      setSosOpen(false);
                      setSlidePct(0);
                      slidePctRef.current = 0;
                    }}
                    className="p-1.5 rounded-full bg-[#212121] text-neutral-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-center px-2">
                  <div className="text-base font-bold text-white">Slide to Alert Medic</div>
                  <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                    Drag completely to the right to dispatch Site HSE Supervisor &amp; Medic.
                  </p>
                </div>

                {/* Slide-to-Confirm Track */}
                <div className="space-y-3">
                  <div
                    ref={sosTrackRef}
                    data-testid="sos-slider-track"
                    className="relative h-12 rounded-full bg-[#212121] border border-[#fa114f]/50 flex items-center px-1 overflow-hidden touch-none"
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-[#fa114f]/25 pointer-events-none transition-all duration-75"
                      style={{ width: `${Math.round(slidePct * 100)}%` }}
                    />
                    <span className="w-full text-center text-[11px] font-semibold tracking-wider uppercase text-neutral-300 pointer-events-none pl-6">
                      {slidePct >= 0.94 ? 'Release to Send SOS' : 'Slide for SOS'}
                    </span>
                    <div
                      role="slider"
                      tabIndex={0}
                      data-testid="sos-slider-thumb"
                      aria-label="Slide to confirm Emergency SOS"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(slidePct * 100)}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture?.(e.pointerId);
                        setDraggingSos(true);
                        updateSosDragFromClientX(e.clientX);
                      }}
                      onPointerMove={(e) => {
                        if (!draggingSos) return;
                        updateSosDragFromClientX(e.clientX);
                      }}
                      onPointerUp={() => {
                        if (!draggingSos) return;
                        finishSosDrag();
                      }}
                      onPointerCancel={() => {
                        if (!draggingSos) return;
                        finishSosDrag();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'End') {
                          slidePctRef.current = 1;
                          setSlidePct(1);
                          finishSosDrag();
                        }
                      }}
                      style={{
                        transform: `translateX(${Math.round(
                          slidePct * Math.max(180, (sosTrackRef.current?.clientWidth ?? 284) - 48)
                        )}px)`,
                      }}
                      className="relative z-10 w-10 h-10 rounded-full bg-[#fa114f] text-white flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subtle Hardware Micro-Hint Bar */}
      <div className="mt-2.5 flex items-center justify-center gap-3 text-[11px] text-slate-500 font-mono">
        <span>Tap Score: Cards</span>
        <span aria-hidden="true">·</span>
        <span>Crown: Apps</span>
        <span aria-hidden="true">·</span>
        <span>Hold Side: SOS</span>
      </div>
    </div>
  );
}
