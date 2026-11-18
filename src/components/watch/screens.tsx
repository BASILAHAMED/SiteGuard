import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Bell,
  BellOff,
  Bluetooth,
  BluetoothOff,
  Check,
  Coffee,
  Droplets,
  Gauge,
  HeartPulse,
  LayoutList,
  Moon,
  OctagonAlert,
  Settings2,
  ShieldAlert,
  Siren,
  Smartphone,
  Sun,
  ThermometerSun,
  TrendingUp,
  Vibrate,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatTemperature, type TemperatureUnit } from '../../shared/temperature';
import type { RiskTier, SupportedLanguage, WorkerStateSelf } from '../../shared/types';
import { anyFaultActive, faultDescription, type WatchAlert } from './alertDiff';

/* ────────────────────────────── shared bits ────────────────────────────── */

export const WATCH_FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "SF Pro Display", "Inter", "Plus Jakarta Sans", system-ui, sans-serif';

export const TIER_COLOR: Record<RiskTier, string> = {
  Green: '#30d158',
  Amber: '#ff9f0a',
  Red: '#ff453a',
};
export const DEGRADED_COLOR = '#8e8e93';

export function tierColor(s: WorkerStateSelf): string {
  return anyFaultActive(s) ? DEGRADED_COLOR : TIER_COLOR[s.assessment.tier];
}

const gstFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const gstDateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai',
  weekday: 'short',
  day: 'numeric',
});

export function fmtGst(d: Date): string {
  return gstFmt.format(d);
}

/** Wall-clock ticks every 10 s — the watch clock is Abu Dhabi time (GST). */
export function useNow(intervalMs = 10_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function minutesUntilGst(hhmm: string, now: Date): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const [h, mm] = gstFmt.format(now).split(':').map(Number);
  const target = Number(m[1]) * 60 + Number(m[2]);
  return target - (h * 60 + mm);
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m} min`;
}

export function StatusBar({
  title,
  color = '#ff9f0a',
  now,
  onBack,
}: {
  title: string;
  color?: string;
  now: Date;
  onBack?: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between px-9 pt-5 pb-2 bg-gradient-to-b from-black via-black/95 to-transparent">
      <button
        type="button"
        onClick={onBack}
        aria-label={`${title} — back`}
        className="flex items-center gap-1 text-[15px] font-semibold cursor-pointer"
        style={{ color }}
      >
        {onBack && <span className="text-[18px] leading-none">‹</span>}
        <span>{title}</span>
      </button>
      <span className="text-[15px] font-semibold text-white tabular-nums">{fmtGst(now)}</span>
    </div>
  );
}

function Tile({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[22px] bg-[#1c1c1e] px-4 py-3 ${className}`}>{children}</div>;
}

function Scroller({
  scrollRef,
  children,
  testId,
}: {
  scrollRef: Ref<HTMLDivElement>;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div
      ref={scrollRef}
      data-testid={testId}
      data-scrollable="true"
      className="h-full overflow-y-auto overflow-x-hidden pb-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ fontFamily: WATCH_FONT }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────── Launcher ────────────────────────────── */

export type AppId =
  | 'gauge'
  | 'vitals'
  | 'forecast'
  | 'break'
  | 'alerts'
  | 'sos'
  | 'cards'
  | 'settings';

const APPS: Array<{ id: AppId; label: string; color: string; icon: ReactNode }> = [
  { id: 'gauge', label: 'Heat Gauge', color: '#ff9f0a', icon: <Gauge className="w-5 h-5" /> },
  { id: 'vitals', label: 'Vitals', color: '#ff375f', icon: <HeartPulse className="w-5 h-5" /> },
  { id: 'forecast', label: 'Forecast', color: '#64d2ff', icon: <TrendingUp className="w-5 h-5" /> },
  { id: 'break', label: 'Break & Water', color: '#0a84ff', icon: <Droplets className="w-5 h-5" /> },
  { id: 'alerts', label: 'Alerts', color: '#ff453a', icon: <Bell className="w-5 h-5" /> },
  { id: 'sos', label: 'Emergency SOS', color: '#ff3b30', icon: <Siren className="w-5 h-5" /> },
  { id: 'cards', label: 'Shift Cards', color: '#787aff', icon: <LayoutList className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', color: '#8e8e93', icon: <Settings2 className="w-5 h-5" /> },
];

export function LauncherScreen({
  scrollRef,
  now,
  unread,
  onOpen,
}: {
  scrollRef: Ref<HTMLDivElement>;
  now: Date;
  unread: number;
  onOpen: (id: AppId) => void;
}) {
  return (
    <Scroller scrollRef={scrollRef} testId="watch-launcher">
      <StatusBar title="Apps" now={now} color="#fff" />
      <ul className="px-5 space-y-2">
        {APPS.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              data-testid={`launcher-${a.id}`}
              onClick={() => onOpen(a.id)}
              className="w-full flex items-center gap-3 rounded-[24px] bg-[#1c1c1e] hover:bg-[#2c2c2e] active:scale-[0.98] transition px-3 py-2.5 cursor-pointer"
            >
              <span
                className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0"
                style={{ background: a.color }}
              >
                {a.icon}
              </span>
              <span className="text-[16px] font-medium text-white text-left flex-1">{a.label}</span>
              {a.id === 'alerts' && unread > 0 && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#ff453a] text-white text-[12px] font-bold flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Scroller>
  );
}

/* ────────────────────────────── Vitals ────────────────────────────── */

function EcgTrace({ hr, color, animate }: { hr: number; color: string; animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const W = c.width;
    const H = c.height;
    const beatPx = 90; // horizontal px per beat at the drawn speed
    const pxPerSec = (beatPx * Math.max(40, hr)) / 60;
    // Synthetic PQRST shape, phase 0..1 → amplitude (display only).
    const shape = (p: number) => {
      const gauss = (mu: number, s: number, a: number) => a * Math.exp(-((p - mu) ** 2) / (2 * s * s));
      return (
        gauss(0.18, 0.025, 0.12) -
        gauss(0.29, 0.008, 0.12) +
        gauss(0.31, 0.012, 1) -
        gauss(0.335, 0.01, 0.25) +
        gauss(0.55, 0.04, 0.22)
      );
    };
    let raf = 0;
    let offset = 0;
    let last = performance.now();
    const draw = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      offset += dt * pxPerSec;
      g.clearRect(0, 0, W, H);
      g.lineWidth = 2;
      g.strokeStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 6;
      g.beginPath();
      for (let x = 0; x <= W; x += 1) {
        const p = (((x + offset) % beatPx) + beatPx) % beatPx / beatPx;
        const y = H * 0.68 - shape(p) * H * 0.58;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      // fade-in leading edge
      const grad = g.createLinearGradient(0, 0, 40, 0);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 40, H);
      if (animate) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [hr, color, animate]);
  return <canvas ref={ref} width={280} height={70} className="w-full h-[70px]" aria-hidden />;
}

function MiniSpark({ values, color, max }: { values: number[]; color: string; max: number }) {
  if (values.length < 2) return null;
  const W = 240;
  const H = 40;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * W},${H - (Math.max(0, Math.min(max, v)) / max) * H}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function VitalsScreen({
  state,
  scrollRef,
  now,
  tempUnit,
  reducedMotion,
  onBack,
}: {
  state: WorkerStateSelf;
  scrollRef: Ref<HTMLDivElement>;
  now: Date;
  tempUnit: TemperatureUnit;
  reducedMotion: boolean;
  onBack: () => void;
}) {
  const { latestFrame: f, faults, assessment } = state;
  const hrLost = faults.bleDisconnected;
  const beatSec = 60 / Math.max(40, f.hrBpm);
  const bars = f.rssiDbm <= -900 ? 0 : f.rssiDbm > -60 ? 4 : f.rssiDbm > -70 ? 3 : f.rssiDbm > -80 ? 2 : 1;
  const thresholds = state.tierThresholds;
  return (
    <Scroller scrollRef={scrollRef} testId="watch-vitals">
      <StatusBar title="Vitals" color="#ff375f" now={now} onBack={onBack} />
      <div className="px-6 space-y-2.5">
        <div className="flex items-end gap-2 px-1">
          <HeartPulse
            className="w-7 h-7 text-[#ff375f] mb-1.5"
            style={reducedMotion || hrLost ? undefined : { animation: `sgHeartbeat ${beatSec}s ease-in-out infinite` }}
          />
          <span data-testid="vitals-hr" className="text-[52px] leading-none font-semibold text-white tabular-nums">
            {hrLost ? '--' : f.hrBpm}
          </span>
          <span className="text-[15px] text-[#ff375f] font-semibold mb-1.5">BPM</span>
        </div>
        {hrLost ? (
          <div className="h-[70px] flex items-center justify-center text-[13px] text-[#8e8e93]">
            No signal · BLE link down
          </div>
        ) : (
          <>
            <EcgTrace hr={f.hrBpm} color="#ff375f" animate={!reducedMotion} />
            <p className="text-[10px] text-[#8e8e93] -mt-1 px-1">Simulated waveform · rate from BLE frame</p>
          </>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Tile>
            <div className="text-[12px] text-[#ff9f0a] font-semibold flex items-center gap-1">
              <ThermometerSun className="w-3.5 h-3.5" /> Skin
            </div>
            <div className="text-[22px] text-white font-semibold tabular-nums">
              {formatTemperature(f.skinTempC, tempUnit, 1)}
            </div>
          </Tile>
          <Tile>
            <div className="text-[12px] text-[#bf5af2] font-semibold">PSI</div>
            <div className="text-[22px] text-white font-semibold tabular-nums">
              {assessment.psi !== null ? assessment.psi.toFixed(1) : 'N/A'}
            </div>
          </Tile>
          <Tile>
            <div className="text-[12px] text-[#0a84ff] font-semibold flex items-center gap-1">
              {hrLost ? <BluetoothOff className="w-3.5 h-3.5" /> : <Bluetooth className="w-3.5 h-3.5" />} Link
            </div>
            <div className="flex items-end gap-[3px] h-[22px] mt-1" aria-label={`${bars} of 4 signal bars`}>
              {[1, 2, 3, 4].map((b) => (
                <span
                  key={b}
                  className="w-[6px] rounded-sm"
                  style={{ height: 5 + b * 4, background: b <= bars ? '#0a84ff' : '#3a3a3c' }}
                />
              ))}
              <span className="ml-2 text-[12px] text-[#8e8e93] tabular-nums">
                {hrLost ? 'off' : `${f.rssiDbm} dBm`}
              </span>
            </div>
          </Tile>
          <Tile>
            <div className="text-[12px] text-[#30d158] font-semibold">Signal</div>
            <div className="text-[22px] text-white font-semibold tabular-nums">
              {Math.round(f.signalQuality * 100)}%
            </div>
          </Tile>
        </div>
        <Tile>
          <div className="flex justify-between text-[12px] font-semibold">
            <span className="text-[#ff9f0a]">Strain trend</span>
            <span className="text-[#8e8e93] tabular-nums">{state.history.length} samples</span>
          </div>
          <MiniSpark
            values={state.history.map((h) => h.compositeScore)}
            color={tierColor(state)}
            max={thresholds?.maxScore ?? 10}
          />
        </Tile>
      </div>
    </Scroller>
  );
}

/* ────────────────────────────── Forecast ────────────────────────────── */

function etaLabel(min: number | null): string {
  if (min === null) return 'Not projected';
  if (min === 0) return 'Reached';
  return `~${min} min`;
}

export function ForecastScreen({
  state,
  scrollRef,
  now,
  onBack,
}: {
  state: WorkerStateSelf;
  scrollRef: Ref<HTMLDivElement>;
  now: Date;
  onBack: () => void;
}) {
  const { forecast: fc, assessment, history } = state;
  const th = state.tierThresholds ?? { greenMax: 4, amberMin: 4, redMin: 7, maxScore: 10 };
  const max = th.maxScore || 10;
  const W = 280;
  const H = 150;
  const PAD_L = 4;
  const nowMin = state.simulatedClockMin;
  const past = history.slice(-6);
  const minX = past.length ? Math.min(-12, past[0].minuteOffset - nowMin) : -12;
  const xOf = (rel: number) => PAD_L + ((rel - minX) / (30 - minX)) * (W - PAD_L - 4);
  const yOf = (v: number) => H - (Math.max(0, Math.min(max, v)) / max) * H;
  const degraded = anyFaultActive(state);

  const ready = fc.status === 'ready' && fc.psi15 && fc.psi30;
  const pastPts = past.map((p) => `${xOf(p.minuteOffset - nowMin)},${yOf(p.compositeScore)}`);
  const nowPt = `${xOf(0)},${yOf(assessment.compositeScore)}`;
  const band =
    ready && fc.psi15 && fc.psi30
      ? `${xOf(0)},${yOf(assessment.compositeScore)} ${xOf(15)},${yOf(fc.psi15.high)} ${xOf(30)},${yOf(
          fc.psi30.high
        )} ${xOf(30)},${yOf(fc.psi30.low)} ${xOf(15)},${yOf(fc.psi15.low)}`
      : '';

  return (
    <Scroller scrollRef={scrollRef} testId="watch-forecast">
      <StatusBar title="Forecast" color="#64d2ff" now={now} onBack={onBack} />
      <div className="px-6 space-y-2.5">
        <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full" role="img" aria-label="30 minute strain trajectory">
          <rect x={0} y={yOf(th.amberMin)} width={W} height={H - yOf(th.amberMin)} fill="#30d158" opacity={0.1} />
          <rect
            x={0}
            y={yOf(th.redMin)}
            width={W}
            height={yOf(th.amberMin) - yOf(th.redMin)}
            fill="#ff9f0a"
            opacity={0.12}
          />
          <rect x={0} y={0} width={W} height={yOf(th.redMin)} fill="#ff453a" opacity={0.12} />
          <line x1={xOf(0)} x2={xOf(0)} y1={0} y2={H} stroke="#3a3a3c" strokeDasharray="3 3" />
          {ready && <polygon data-testid="forecast-ci-band" points={band} fill="#64d2ff" opacity={0.22} />}
          <polyline
            points={[...pastPts, nowPt].join(' ')}
            fill="none"
            stroke={degraded ? DEGRADED_COLOR : '#fff'}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          {ready && fc.psi15 && fc.psi30 && (
            <polyline
              points={`${nowPt} ${xOf(15)},${yOf(fc.psi15.point)} ${xOf(30)},${yOf(fc.psi30.point)}`}
              fill="none"
              stroke="#64d2ff"
              strokeWidth={2.5}
              strokeDasharray="5 4"
            />
          )}
          <circle cx={xOf(0)} cy={yOf(assessment.compositeScore)} r={4.5} fill={tierColor(state)} />
          {ready && fc.psi15 && <circle cx={xOf(15)} cy={yOf(fc.psi15.point)} r={3.5} fill="#64d2ff" />}
          {ready && fc.psi30 && <circle cx={xOf(30)} cy={yOf(fc.psi30.point)} r={3.5} fill="#64d2ff" />}
          {[
            ['Now', 0],
            ['+15', 15],
            ['+30', 30],
          ].map(([l, x]) => (
            <text key={l} x={xOf(x as number)} y={H + 13} textAnchor="middle" fontSize={11} fill="#8e8e93">
              {l}
            </text>
          ))}
        </svg>

        {ready && fc.psi15 && fc.psi30 ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Tile>
                <div className="text-[12px] text-[#8e8e93]">t+15 m</div>
                <div className="text-[20px] font-semibold text-white tabular-nums">{fc.psi15.point.toFixed(1)}</div>
                <div className="text-[11px] text-[#8e8e93] tabular-nums">
                  {fc.psi15.low.toFixed(1)}–{fc.psi15.high.toFixed(1)} · {fc.predictedTier15}
                </div>
              </Tile>
              <Tile>
                <div className="text-[12px] text-[#8e8e93]">t+30 m</div>
                <div className="text-[20px] font-semibold text-white tabular-nums">{fc.psi30.point.toFixed(1)}</div>
                <div className="text-[11px] text-[#8e8e93] tabular-nums">
                  {fc.psi30.low.toFixed(1)}–{fc.psi30.high.toFixed(1)} · {fc.predictedTier30}
                </div>
              </Tile>
            </div>
            <div data-testid="forecast-eta-chips" className="flex gap-2">
              <span className="flex-1 rounded-full px-3 py-2 text-[12px] font-semibold text-center bg-[#ff9f0a]/15 text-[#ff9f0a]">
                → Amber {etaLabel(fc.projectedAmberCrossingMin)}
              </span>
              <span className="flex-1 rounded-full px-3 py-2 text-[12px] font-semibold text-center bg-[#ff453a]/15 text-[#ff453a]">
                → Red {etaLabel(fc.projectedRedCrossingMin)}
              </span>
            </div>
            <p className="text-[10px] text-[#8e8e93] px-1">{fc.modelLabel}</p>
          </>
        ) : (
          <Tile>
            <div className="text-[14px] font-semibold text-[#ff9f0a]">Collecting trend data</div>
            <p className="text-[12px] text-[#8e8e93] mt-1">{fc.reason ?? 'Waiting for clean samples.'}</p>
          </Tile>
        )}
      </div>
    </Scroller>
  );
}

/* ────────────────────────────── Break & water ────────────────────────────── */

export function BreakScreen({
  state,
  scrollRef,
  now,
  onBack,
  localWater,
  onLogWater,
  breakEndsAt,
  onStartBreak,
  onCancelBreak,
}: {
  state: WorkerStateSelf;
  scrollRef: Ref<HTMLDivElement>;
  now: Date;
  onBack: () => void;
  localWater: number;
  onLogWater: () => void;
  breakEndsAt: number | null;
  onStartBreak: () => void;
  onCancelBreak: () => void;
}) {
  const ctx = state.context;
  const toBreak = minutesUntilGst(ctx.plannedBreakTime, now);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    if (!breakEndsAt) return;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [breakEndsAt]);
  const remainingMs = breakEndsAt ? Math.max(0, breakEndsAt - tick) : 0;
  const total = 15 * 60_000;
  const R = 46;
  const C = 2 * Math.PI * R;

  return (
    <Scroller scrollRef={scrollRef} testId="watch-break">
      <StatusBar title="Break & Water" color="#0a84ff" now={now} onBack={onBack} />
      <div className="px-6 space-y-2.5">
        <Tile className="flex items-center gap-3">
          <Coffee className="w-6 h-6 text-[#0a84ff] shrink-0" />
          <div>
            <div className="text-[12px] text-[#8e8e93]">Planned break · {ctx.plannedBreakTime} GST</div>
            <div className="text-[18px] font-semibold text-white">
              {toBreak === null ? '—' : toBreak > 0 ? `in ${fmtDuration(toBreak)}` : 'Due now / passed'}
            </div>
          </div>
        </Tile>

        <Tile className="flex flex-col items-center">
          {breakEndsAt ? (
            <>
              <svg viewBox="0 0 110 110" className="w-[110px] h-[110px]" aria-label="Shade break timer">
                <circle cx={55} cy={55} r={R} stroke="#1f3b5c" strokeWidth={9} fill="none" />
                <circle
                  cx={55}
                  cy={55}
                  r={R}
                  stroke="#0a84ff"
                  strokeWidth={9}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - remainingMs / total)}
                  transform="rotate(-90 55 55)"
                />
                <text x={55} y={61} textAnchor="middle" fontSize={20} fontWeight={700} fill="#fff">
                  {Math.floor(remainingMs / 60000)}:{String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0')}
                </text>
              </svg>
              <button
                type="button"
                onClick={onCancelBreak}
                className="mt-1 text-[13px] text-[#8e8e93] cursor-pointer"
              >
                End break timer
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="start-break"
              onClick={onStartBreak}
              className="w-full rounded-full bg-[#0a84ff] text-white text-[15px] font-semibold py-2.5 cursor-pointer active:scale-[0.98]"
            >
              Start 15-min shade break
            </button>
          )}
        </Tile>

        <Tile className="flex items-center justify-between">
          <div>
            <div className="text-[12px] text-[#64d2ff] font-semibold flex items-center gap-1">
              <Droplets className="w-3.5 h-3.5" /> Hydration
            </div>
            <div className="text-[18px] text-white font-semibold">{ctx.hydrationCount} cups today</div>
            {localWater > 0 && (
              <div className="text-[11px] text-[#8e8e93]">+{localWater} logged on watch · not synced</div>
            )}
          </div>
          <button
            type="button"
            data-testid="log-water"
            onClick={onLogWater}
            aria-label="Log one cup of water"
            className="w-11 h-11 rounded-full bg-[#64d2ff]/20 text-[#64d2ff] text-[22px] font-bold cursor-pointer active:scale-95"
          >
            +
          </button>
        </Tile>
        <p className="text-[11px] text-[#8e8e93] px-1">Breaks taken today: {ctx.breaksTakenTodayMin} min</p>
      </div>
    </Scroller>
  );
}

/* ────────────────────────────── Notification centre ────────────────────────────── */

const TONE_COLOR: Record<WatchAlert['tone'], string> = {
  red: '#ff453a',
  amber: '#ff9f0a',
  grey: '#8e8e93',
  sky: '#64d2ff',
  green: '#30d158',
};

export function alertIcon(a: WatchAlert, cls = 'w-5 h-5') {
  switch (a.kind) {
    case 'red':
      return <OctagonAlert className={cls} />;
    case 'amber':
    case 'prewarn-amber':
    case 'prewarn-red':
      return <ThermometerSun className={cls} />;
    case 'fault-on':
      return <BluetoothOff className={cls} />;
    case 'fault-off':
      return <Bluetooth className={cls} />;
    case 'directive':
      return <ShieldAlert className={cls} />;
    default:
      return <Check className={cls} />;
  }
}

export function NotificationCenter({
  items,
  scrollRef,
  now,
  onClear,
  onClose,
  dir,
}: {
  items: WatchAlert[];
  scrollRef: Ref<HTMLDivElement>;
  now: Date;
  onClear: () => void;
  onClose: () => void;
  dir: 'ltr' | 'rtl';
}) {
  return (
    <Scroller scrollRef={scrollRef} testId="watch-notifications">
      <StatusBar title="Notifications" color="#fff" now={now} onBack={onClose} />
      <div className="px-5 space-y-2" dir={dir}>
        {items.length === 0 ? (
          <div className="pt-16 flex flex-col items-center text-[#8e8e93] gap-2">
            <BellOff className="w-8 h-8" />
            <span className="text-[15px]">No Notifications</span>
          </div>
        ) : (
          <>
            {items.map((a) => (
              <div key={a.id} data-testid="notification-item" className="rounded-[22px] bg-[#1c1c1e] px-3.5 py-3">
                <div className="flex items-center gap-2 text-[12px]">
                  <span style={{ color: TONE_COLOR[a.tone] }}>{alertIcon(a, 'w-4 h-4')}</span>
                  <span className="font-semibold uppercase tracking-wide" style={{ color: TONE_COLOR[a.tone] }}>
                    SiteGuard
                  </span>
                  <span className="ml-auto text-[#8e8e93] tabular-nums">{fmtGst(new Date(a.createdAt))}</span>
                </div>
                <div className="mt-1 text-[15px] font-semibold text-white">{a.title}</div>
                <div className="text-[13px] text-[#d1d1d6] leading-snug line-clamp-3">{a.body}</div>
              </div>
            ))}
            <button
              type="button"
              onClick={onClear}
              className="w-full rounded-full bg-[#2c2c2e] text-white text-[14px] font-semibold py-2.5 cursor-pointer"
            >
              Clear All
            </button>
          </>
        )}
      </div>
    </Scroller>
  );
}

/* ────────────────────────────── Control centre ────────────────────────────── */

const LANG_SHORT: Record<SupportedLanguage, string> = { en: 'EN', hi: 'HI', ur: 'UR', bn: 'BN', tl: 'TL' };

function RoundToggle({
  on,
  label,
  onClick,
  children,
  testId,
  activeColor = '#0a84ff',
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
  testId: string;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      data-testid={testId}
      onClick={onClick}
      className="w-[64px] h-[64px] rounded-full flex items-center justify-center cursor-pointer active:scale-95 transition"
      style={{ background: on ? activeColor : '#2c2c2e', color: on ? '#fff' : '#d1d1d6' }}
    >
      {children}
    </button>
  );
}

export function ControlCenter({
  state,
  scrollRef,
  now,
  aod,
  haptics,
  sound,
  autoDim,
  onToggleAod,
  onToggleHaptics,
  onToggleSound,
  onToggleAutoDim,
  onLanguage,
  onClose,
}: {
  state: WorkerStateSelf;
  scrollRef: Ref<HTMLDivElement>;
  now: Date;
  aod: boolean;
  haptics: boolean;
  sound: boolean;
  autoDim: boolean;
  onToggleAod: () => void;
  onToggleHaptics: () => void;
  onToggleSound: () => void;
  onToggleAutoDim: () => void;
  onLanguage: (l: SupportedLanguage) => void;
  onClose: () => void;
}) {
  const lang = state.context.preferredLanguage;
  return (
    <Scroller scrollRef={scrollRef} testId="watch-control-center">
      <StatusBar title="Control Centre" color="#fff" now={now} onBack={onClose} />
      <div className="px-7">
        <div className="flex items-center justify-between text-[13px] text-[#8e8e93] mb-3">
          <span className="tabular-nums">Battery {state.latestFrame.batteryPct}%</span>
          <span>{state.context.deviceId}</span>
        </div>
        <div className="grid grid-cols-3 gap-3 justify-items-center">
          <RoundToggle on={aod} label="Always-On display" onClick={onToggleAod} testId="cc-aod" activeColor="#5e5ce6">
            <Moon className="w-6 h-6" />
          </RoundToggle>
          <RoundToggle on={haptics} label="Haptic alerts" onClick={onToggleHaptics} testId="cc-haptics">
            <Vibrate className="w-6 h-6" />
          </RoundToggle>
          <RoundToggle on={sound} label="Alert chime" onClick={onToggleSound} testId="cc-sound" activeColor="#ff9f0a">
            {sound ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </RoundToggle>
          <RoundToggle on={autoDim} label="Wrist-down auto dim" onClick={onToggleAutoDim} testId="cc-autodim">
            <Sun className="w-6 h-6" />
          </RoundToggle>
          <RoundToggle on={!state.faults.bleDisconnected} label="Phone link status" onClick={() => {}} testId="cc-link" activeColor="#30d158">
            <Smartphone className="w-6 h-6" />
          </RoundToggle>
        </div>
        <div className="mt-4 text-[12px] text-[#8e8e93] mb-2">Alert language</div>
        <div className="flex gap-1.5" role="group" aria-label="Watch alert language">
          {(Object.keys(LANG_SHORT) as SupportedLanguage[]).map((l) => (
            <button
              key={l}
              type="button"
              data-testid={`cc-lang-${l}`}
              aria-pressed={lang === l}
              onClick={() => onLanguage(l)}
              className="flex-1 rounded-full py-2 text-[13px] font-bold cursor-pointer"
              style={{ background: lang === l ? '#ff9f0a' : '#2c2c2e', color: lang === l ? '#000' : '#fff' }}
            >
              {LANG_SHORT[l]}
            </button>
          ))}
        </div>
      </div>
    </Scroller>
  );
}

/* ────────────────────────────── Quick panel (side button) ────────────────────────────── */

export function QuickPanel({
  state,
  now,
  sending,
  onSafe,
  onWater,
  onAlerts,
  onClose,
}: {
  state: WorkerStateSelf;
  now: Date;
  sending: boolean;
  onSafe: () => void;
  onWater: () => void;
  onAlerts: () => void;
  onClose: () => void;
}) {
  const last = state.lastCheckIn;
  return (
    <div data-testid="watch-quick-panel" className="h-full flex flex-col" style={{ fontFamily: WATCH_FONT }}>
      <StatusBar title="Quick Actions" color="#ff9f0a" now={now} onBack={onClose} />
      <div className="px-6 space-y-2 flex-1">
        <button
          type="button"
          data-testid="quick-safe"
          disabled={sending}
          onClick={onSafe}
          className="w-full rounded-[24px] bg-[#30d158] text-black text-[17px] font-bold py-3.5 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] disabled:opacity-60"
        >
          <Check className="w-5 h-5" /> {sending ? 'Sending…' : "Check in: I'm safe"}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onWater}
            className="rounded-[22px] bg-[#1c1c1e] text-[#64d2ff] text-[14px] font-semibold py-3 flex flex-col items-center gap-1 cursor-pointer"
          >
            <Droplets className="w-5 h-5" /> Log water
          </button>
          <button
            type="button"
            onClick={onAlerts}
            className="rounded-[22px] bg-[#1c1c1e] text-[#ff453a] text-[14px] font-semibold py-3 flex flex-col items-center gap-1 cursor-pointer"
          >
            <Bell className="w-5 h-5" /> Alerts
          </button>
        </div>
        <p className="text-[12px] text-[#8e8e93] text-center pt-1">
          {last
            ? `Last check-in ${fmtGst(new Date(last.timestamp))} · ${last.status === 'help' ? 'SOS' : 'safe'}`
            : 'No check-in yet this shift'}
        </p>
        <p className="text-[12px] text-[#ff453a] text-center font-semibold">Hold side button for Emergency SOS</p>
      </div>
    </div>
  );
}

/* ────────────────────────────── SOS ────────────────────────────── */

export function SosCountdown({
  startedAt,
  durationMs,
  onCancel,
  onSendNow,
}: {
  startedAt: number;
  durationMs: number;
  onCancel: () => void;
  onSendNow: () => void;
}) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setT(Date.now()), 50);
    return () => window.clearInterval(id);
  }, []);
  const frac = Math.min(1, (t - startedAt) / durationMs);
  const secs = Math.max(0, Math.ceil((durationMs - (t - startedAt)) / 1000));
  const R = 64;
  const C = 2 * Math.PI * R;
  return (
    <div
      data-testid="watch-sos-countdown"
      className="h-full flex flex-col items-center justify-center text-white"
      style={{ fontFamily: WATCH_FONT, background: 'radial-gradient(circle at 50% 40%, #5a0d0d, #1a0000 70%)' }}
    >
      <div className="text-[14px] font-semibold text-[#ff6961] uppercase tracking-[0.18em]">Emergency SOS</div>
      <svg viewBox="0 0 160 160" className="w-[160px] h-[160px] my-2">
        <circle cx={80} cy={80} r={R} stroke="#3b0a0a" strokeWidth={12} fill="none" />
        <circle
          cx={80}
          cy={80}
          r={R}
          stroke="#ff3b30"
          strokeWidth={12}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - frac)}
          transform="rotate(-90 80 80)"
        />
        <text x={80} y={98} textAnchor="middle" fontSize={54} fontWeight={700} fill="#fff">
          {secs}
        </text>
      </svg>
      <p className="text-[13px] text-[#ffb4ae] text-center px-10 leading-snug">
        Supervisor &amp; site medic will be alerted with your zone.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="sos-cancel"
          onClick={onCancel}
          className="rounded-full bg-[#2c2c2e] px-5 py-2.5 text-[15px] font-semibold cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="sos-send-now"
          onClick={onSendNow}
          className="rounded-full bg-[#ff3b30] px-5 py-2.5 text-[15px] font-semibold cursor-pointer"
        >
          Send now
        </button>
      </div>
    </div>
  );
}

export function SosActive({
  state,
  sending,
  onSafe,
  onClose,
  reducedMotion,
}: {
  state: WorkerStateSelf;
  sending: boolean;
  onSafe: () => void;
  onClose: () => void;
  reducedMotion: boolean;
}) {
  const ts = state.lastCheckIn?.timestamp;
  return (
    <div
      data-testid="watch-sos-active"
      className="h-full flex flex-col items-center justify-center text-white px-7 text-center"
      style={{ fontFamily: WATCH_FONT, background: 'radial-gradient(circle at 50% 35%, #4a0a0a, #120000 72%)' }}
    >
      <div className="relative w-[88px] h-[88px] flex items-center justify-center">
        {!reducedMotion && <span className="absolute inset-0 rounded-full bg-[#ff3b30]/40 sg-sos-ripple" />}
        <span className="relative w-[72px] h-[72px] rounded-full bg-[#ff3b30] flex items-center justify-center">
          <Siren className="w-9 h-9" />
        </span>
      </div>
      <div className="mt-3 text-[22px] font-bold">SOS sent</div>
      <p className="text-[13px] text-[#ffb4ae] mt-1 leading-snug">
        Supervisor &amp; HSE medic notified{ts ? ` · ${fmtGst(new Date(ts))}` : ''}
      </p>
      <p className="text-[12px] text-[#d1d1d6] mt-2 leading-snug">{state.supervisorDirective ?? 'Stop work. Stay in shade.'}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          data-testid="sos-safe"
          disabled={sending}
          onClick={onSafe}
          className="rounded-full bg-[#30d158] text-black px-4 py-2.5 text-[14px] font-bold cursor-pointer disabled:opacity-60"
        >
          {sending ? 'Sending…' : "I'm safe now"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close SOS screen"
          className="rounded-full bg-[#2c2c2e] w-10 h-10 flex items-center justify-center cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────── Alternate faces ────────────────────────────── */

export type FaceStyle = 'gauge' | 'modular' | 'minimal';

function Ring({ frac, color, r, w }: { frac: number; color: string; r: number; w: number }) {
  const C = 2 * Math.PI * r;
  return (
    <>
      <circle cx={0} cy={0} r={r} stroke={color} strokeOpacity={0.22} strokeWidth={w} fill="none" />
      <circle
        cx={0}
        cy={0}
        r={r}
        stroke={color}
        strokeWidth={w}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={C * (1 - Math.max(0.001, Math.min(1, frac)))}
        transform="rotate(-90)"
      />
    </>
  );
}

export function ModularFace({ state, now, tempUnit }: { state: WorkerStateSelf; now: Date; tempUnit: TemperatureUnit }) {
  const { assessment, latestFrame: f, forecast: fc } = state;
  const max = state.tierThresholds?.maxScore ?? 10;
  const col = tierColor(state);
  const degraded = anyFaultActive(state);
  return (
    <div data-testid="watchface-modular" className="h-full px-8 pt-7 pb-6 flex flex-col text-white" style={{ fontFamily: WATCH_FONT }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[15px] font-semibold text-[#ff9f0a] uppercase">{gstDateFmt.format(now)}</span>
        <span className="text-[13px] text-[#8e8e93] tabular-nums">BAT {f.batteryPct}%</span>
      </div>
      <div className="text-[76px] leading-[1] font-semibold tabular-nums tracking-tight mt-1">{fmtGst(now)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 flex-1">
        <div className="rounded-[20px] bg-[#1c1c1e] p-3 flex items-center gap-2">
          <svg viewBox="-24 -24 48 48" className="w-11 h-11 shrink-0">
            <Ring frac={assessment.compositeScore / max} color={col} r={19} w={5} />
          </svg>
          <div>
            <div className="text-[20px] font-semibold tabular-nums">{assessment.compositeScore.toFixed(1)}</div>
            <div className="text-[11px] font-semibold" style={{ color: col }}>
              {degraded ? 'Degraded' : assessment.tier}
            </div>
          </div>
        </div>
        <div className="rounded-[20px] bg-[#1c1c1e] p-3">
          <div className="text-[11px] text-[#ff375f] font-semibold flex items-center gap-1">
            <HeartPulse className="w-3.5 h-3.5" /> BPM
          </div>
          <div className="text-[24px] font-semibold tabular-nums">{state.faults.bleDisconnected ? '--' : f.hrBpm}</div>
        </div>
        <div className="rounded-[20px] bg-[#1c1c1e] p-3">
          <div className="text-[11px] text-[#ff9f0a] font-semibold">Skin</div>
          <div className="text-[20px] font-semibold tabular-nums">{formatTemperature(f.skinTempC, tempUnit, 1)}</div>
        </div>
        <div className="rounded-[20px] bg-[#1c1c1e] p-3">
          <div className="text-[11px] text-[#64d2ff] font-semibold">t+15</div>
          <div className="text-[20px] font-semibold tabular-nums">
            {fc.status === 'ready' && fc.psi15 ? fc.psi15.point.toFixed(1) : '—'}
          </div>
        </div>
      </div>
      {degraded && (
        <div className="mt-2 text-[11px] text-[#ff9f0a] font-semibold truncate">{faultDescription(state)}</div>
      )}
    </div>
  );
}

export function MinimalFace({ state, now }: { state: WorkerStateSelf; now: Date }) {
  const { assessment } = state;
  const max = state.tierThresholds?.maxScore ?? 10;
  const col = tierColor(state);
  const degraded = anyFaultActive(state);
  return (
    <div
      data-testid="watchface-minimal"
      className="h-full flex flex-col items-center justify-center text-white"
      style={{ fontFamily: WATCH_FONT }}
    >
      <svg viewBox="-110 -110 220 220" className="w-[250px] h-[250px]">
        <Ring frac={assessment.compositeScore / max} color={col} r={96} w={16} />
        <text x={0} y={-6} textAnchor="middle" fontSize={56} fontWeight={600} fill="#fff">
          {fmtGst(now)}
        </text>
        <text x={0} y={30} textAnchor="middle" fontSize={20} fontWeight={600} fill={col}>
          {degraded ? 'Sensor degraded' : `${assessment.tier} · ${assessment.compositeScore.toFixed(1)}`}
        </text>
      </svg>
    </div>
  );
}

export function FacePicker({
  current,
  onPick,
  state,
  now,
  tempUnit,
  highlight,
}: {
  current: FaceStyle;
  onPick: (f: FaceStyle) => void;
  state: WorkerStateSelf;
  now: Date;
  tempUnit: TemperatureUnit;
  highlight: number;
}) {
  const faces: Array<{ id: FaceStyle; label: string }> = useMemo(
    () => [
      { id: 'gauge', label: 'Heat Gauge' },
      { id: 'modular', label: 'Modular' },
      { id: 'minimal', label: 'Minimal' },
    ],
    []
  );
  const f = faces[highlight] ?? faces[0];
  return (
    <div data-testid="watch-face-picker" className="h-full flex flex-col items-center pt-6 text-white" style={{ fontFamily: WATCH_FONT }}>
      <div className="text-[13px] text-[#8e8e93]">Swipe or turn crown · tap to choose</div>
      <button
        type="button"
        onClick={() => onPick(f.id)}
        aria-label={`Use ${f.label} face`}
        data-testid={`face-option-${f.id}`}
        className="mt-3 w-[230px] h-[280px] rounded-[44px] overflow-hidden border-2 cursor-pointer relative"
        style={{ borderColor: current === f.id ? '#ff9f0a' : '#3a3a3c' }}
      >
        <div className="absolute inset-0 origin-top-left pointer-events-none" style={{ transform: 'scale(0.67)', width: 344, height: 416 }}>
          {f.id === 'gauge' ? (
            <div className="h-full flex items-center justify-center">
              <Gauge className="w-24 h-24" style={{ color: tierColor(state) }} />
            </div>
          ) : f.id === 'modular' ? (
            <ModularFace state={state} now={now} tempUnit={tempUnit} />
          ) : (
            <MinimalFace state={state} now={now} />
          )}
        </div>
      </button>
      <div className="mt-3 text-[16px] font-semibold">{f.label}</div>
      <div className="mt-1 flex gap-1.5">
        {faces.map((x, i) => (
          <span key={x.id} className="w-1.5 h-1.5 rounded-full" style={{ background: i === highlight ? '#fff' : '#48484a' }} />
        ))}
      </div>
    </div>
  );
}
