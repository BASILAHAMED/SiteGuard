import type { HapticPattern } from './alertDiff';

/**
 * Simulated Taptic Engine. A browser can't buzz a wrist, so a haptic is:
 *   1. navigator.vibrate() where the device supports it (Android Chrome),
 *   2. a visual case-shake (handled by WatchShell via `shakeKey`),
 *   3. an optional WebAudio chime (off by default, toggled in Control Center).
 */
const VIBRATE: Record<HapticPattern, number[]> = {
  tick: [6],
  soft: [35],
  single: [90],
  double: [70, 90, 70],
  'triple-long': [320, 160, 320, 160, 320],
};

/** Shake amplitude (px) and repeat count used by the shell animation. */
export const SHAKE: Record<HapticPattern, { amp: number; reps: number }> = {
  tick: { amp: 0, reps: 0 },
  soft: { amp: 1.5, reps: 1 },
  single: { amp: 2, reps: 1 },
  double: { amp: 2.5, reps: 2 },
  'triple-long': { amp: 3, reps: 3 },
};

const CHIME: Record<HapticPattern, Array<[freq: number, ms: number]>> = {
  tick: [],
  soft: [[660, 90]],
  single: [[740, 110]],
  double: [
    [880, 90],
    [660, 120],
  ],
  'triple-long': [
    [988, 220],
    [784, 220],
    [988, 260],
  ],
};

let ctx: AudioContext | null = null;

function playChime(pattern: HapticPattern) {
  const notes = CHIME[pattern];
  if (!notes.length) return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    let t = ctx.currentTime + 0.01;
    for (const [freq, ms] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + ms / 1000 + 0.02);
      t += ms / 1000 + 0.06;
    }
  } catch {
    // Audio is a nice-to-have; never let it break the alert path.
  }
}

export function fireHaptic(
  pattern: HapticPattern,
  opts: { vibrate: boolean; sound: boolean }
): void {
  if (opts.vibrate && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(VIBRATE[pattern]);
    } catch {
      /* unsupported */
    }
  }
  if (opts.sound) playChime(pattern);
}
