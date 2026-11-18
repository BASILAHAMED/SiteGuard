import type { RiskTier, WorkerAlertCopy, WorkerStateSelf } from '../../shared/types';

/**
 * Watch notification engine — pure, framework-free, unit-tested.
 *
 * Every alert is derived ONLY from a transition between two consecutive
 * API payloads (`GET /api/worker/:id/state`). Nothing here computes a new
 * risk number, ETA or tier: titles are fixed UI labels keyed off the API's
 * own `tier` / fault flags, and every body string is copied verbatim from the
 * payload (`alertTranslations[lang].action`, `degradedReason`,
 * `supervisorDirective`, `projected*CrossingMin`).
 */

export type WatchAlertKind =
  | 'red'
  | 'amber'
  | 'prewarn-amber'
  | 'prewarn-red'
  | 'fault-on'
  | 'fault-off'
  | 'directive'
  | 'recovery';

export type HapticPattern = 'tick' | 'soft' | 'single' | 'double' | 'triple-long';

export interface WatchAlert {
  id: string;
  kind: WatchAlertKind;
  /** Higher pre-empts lower in the on-screen queue. */
  priority: number;
  title: string;
  body: string;
  tone: 'red' | 'amber' | 'grey' | 'sky' | 'green';
  haptic: HapticPattern | null;
  /** Red takeover stays on screen until the worker taps acknowledge. */
  requiresAck: boolean;
  /** ms the banner stays expanded before auto-collapsing (0 = never auto). */
  autoDismissMs: number;
  createdAt: number;
}

/** Pre-warning fires when a projected crossing first comes within this many minutes. */
export const PREWARN_WINDOW_MIN = 10;

const TIER_RANK: Record<RiskTier, number> = { Green: 0, Amber: 1, Red: 2 };

export function anyFaultActive(s: WorkerStateSelf): boolean {
  const f = s.faults;
  return f.bleDisconnected || f.lowBattery || f.sensorNoise || f.gpsLoss;
}

function isDegraded(s: WorkerStateSelf): boolean {
  return anyFaultActive(s) || s.assessment.scoringMode === 'environment_only_degraded';
}

/** Fault description strictly from API fields — never a frontend guess. */
export function faultDescription(s: WorkerStateSelf): string {
  if (s.assessment.degradedReason) return s.assessment.degradedReason;
  if (s.assessment.gpsDegraded) return `GPS signal lost · zone pinned to ${s.context.zone}`;
  const active = Object.entries(s.faults)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return active.length ? `Device fault flags: ${active.join(', ')}` : 'Device fault reported';
}

function withinPrewarn(min: number | null): boolean {
  return min !== null && min > 0 && min <= PREWARN_WINDOW_MIN;
}

let seq = 0;
function mk(
  kind: WatchAlertKind,
  partial: Omit<WatchAlert, 'id' | 'kind' | 'createdAt'>,
  now: number
): WatchAlert {
  seq += 1;
  return { id: `${kind}-${now}-${seq}`, kind, createdAt: now, ...partial };
}

/**
 * Compare two consecutive payloads and return the watch notifications the
 * transition should raise (highest priority first). `prev === null` means
 * first load: only an already-elevated tier raises an alert.
 */
export function diffWorkerStates(
  prev: WorkerStateSelf | null,
  next: WorkerStateSelf,
  copy: WorkerAlertCopy,
  now: number = Date.now()
): WatchAlert[] {
  const out: WatchAlert[] = [];

  // Different worker selected → treat as a fresh first load.
  if (prev && prev.context.workerId !== next.context.workerId) prev = null;

  const nextTier = next.assessment.tier;
  const prevTier = prev?.assessment.tier ?? null;
  const fc = next.forecast;
  const pfc = prev?.forecast ?? null;

  // ── Tier transitions ───────────────────────────────────────────────
  if (nextTier === 'Red' && prevTier !== 'Red') {
    out.push(
      mk(
        'red',
        {
          priority: 100,
          title: 'STOP WORK',
          body: copy.action,
          tone: 'red',
          haptic: 'triple-long',
          requiresAck: true,
          autoDismissMs: 0,
        },
        now
      )
    );
  } else if (nextTier === 'Amber' && (prevTier === null || prevTier === 'Green')) {
    out.push(
      mk(
        'amber',
        {
          priority: 70,
          title: 'Heat strain rising',
          body: copy.action,
          tone: 'amber',
          haptic: 'double',
          requiresAck: false,
          autoDismissMs: 6000,
        },
        now
      )
    );
  } else if (prevTier !== null && TIER_RANK[nextTier] < TIER_RANK[prevTier]) {
    out.push(
      mk(
        'recovery',
        {
          priority: 20,
          title: nextTier === 'Green' ? 'Back to safe range' : 'Strain easing',
          body: copy.action,
          tone: nextTier === 'Green' ? 'green' : 'amber',
          haptic: null,
          requiresAck: false,
          autoDismissMs: 4000,
        },
        now
      )
    );
  }

  // ── Forecast pre-warnings (only when the engine itself projects a crossing) ──
  if (fc.status === 'ready') {
    const redNow = fc.projectedRedCrossingMin;
    const redPrev = pfc && pfc.status === 'ready' ? pfc.projectedRedCrossingMin : null;
    const amberNow = fc.projectedAmberCrossingMin;
    const amberPrev = pfc && pfc.status === 'ready' ? pfc.projectedAmberCrossingMin : null;

    if (nextTier !== 'Red' && withinPrewarn(redNow) && !withinPrewarn(redPrev)) {
      out.push(
        mk(
          'prewarn-red',
          {
            priority: 60,
            title: `Red in ~${redNow} min`,
            body: 'Projected by the trend forecast. Start your shade break now.',
            tone: 'red',
            haptic: 'soft',
            requiresAck: false,
            autoDismissMs: 7000,
          },
          now
        )
      );
    } else if (nextTier === 'Green' && withinPrewarn(amberNow) && !withinPrewarn(amberPrev)) {
      out.push(
        mk(
          'prewarn-amber',
          {
            priority: 50,
            title: `Amber in ~${amberNow} min`,
            body: 'Projected by the trend forecast. Start your break early.',
            tone: 'amber',
            haptic: 'soft',
            requiresAck: false,
            autoDismissMs: 7000,
          },
          now
        )
      );
    }
  }

  // ── Device / sensor degradation ───────────────────────────────────
  const degradedNow = isDegraded(next);
  const degradedPrev = prev ? isDegraded(prev) : false;
  if (degradedNow && !degradedPrev) {
    out.push(
      mk(
        'fault-on',
        {
          priority: 40,
          title: 'Sensor degraded',
          body: faultDescription(next),
          tone: 'grey',
          haptic: 'single',
          requiresAck: false,
          autoDismissMs: 5000,
        },
        now
      )
    );
  } else if (!degradedNow && degradedPrev) {
    out.push(
      mk(
        'fault-off',
        {
          priority: 15,
          title: 'Sensors restored',
          body: `${next.context.deviceId} · full physiological scoring resumed`,
          tone: 'green',
          haptic: 'single',
          requiresAck: false,
          autoDismissMs: 3500,
        },
        now
      )
    );
  }

  // ── Supervisor push message ───────────────────────────────────────
  const dir = next.supervisorDirective;
  if (dir && dir !== (prev?.supervisorDirective ?? null) && prev !== null) {
    out.push(
      mk(
        'directive',
        {
          priority: 80,
          title: 'Supervisor',
          body: dir,
          tone: 'sky',
          haptic: 'double',
          requiresAck: false,
          autoDismissMs: 8000,
        },
        now
      )
    );
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Has a NEW "Need Help" check-in been recorded since the previous payload? */
export function newSosCheckIn(prev: WorkerStateSelf | null, next: WorkerStateSelf): boolean {
  const n = next.lastCheckIn;
  if (!n || n.status !== 'help') return false;
  const p = prev?.lastCheckIn;
  return !p || p.timestamp !== n.timestamp || p.status !== 'help';
}
