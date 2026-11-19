import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useAnimate } from 'motion/react';

export interface ShakeSignal {
  key: number;
  amp: number;
  reps: number;
}

interface WatchShellProps {
  children: ReactNode;
  aodMode: boolean;
  /** Positive = crown turned up (scroll content up), negative = down. One call per detent batch. */
  onCrownRotate?: (steps: number) => void;
  onCrownPress?: () => void;
  onSideDown?: () => void;
  onSideUp?: () => void;
  shake?: ShakeSignal | null;
  /** Coloured edge ring around the display while an elevated tier is active. */
  edgeGlow?: 'red' | 'amber' | null;
  reducedMotion?: boolean;
}

const CASE_W = 384;
const CASE_H = 456;
const BAND_H = 92;
const TOTAL_H = CASE_H + BAND_H * 2 - 40;
const DETENT_PX = 14;

/**
 * Apple-Watch-Ultra-style titanium case: Digital Crown with knurling that
 * visibly turns, side button, sapphire glare that tracks the pointer, trail
 * band. The shell is presentation + raw hardware input only — what a crown
 * turn or button press MEANS is decided by SmartWatch.
 */
export function WatchShell({
  children,
  aodMode,
  onCrownRotate,
  onCrownPress,
  onSideDown,
  onSideUp,
  shake,
  edgeGlow,
  reducedMotion,
}: WatchShellProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const crownRef = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState(1);
  const [crownAngle, setCrownAngle] = useState(0);
  const [sidePressed, setSidePressed] = useState(false);
  const [glare, setGlare] = useState({ x: 30, y: 18 });
  const [caseScope, animateCase] = useAnimate<HTMLDivElement>();

  const rotateRef = useRef(onCrownRotate);
  rotateRef.current = onCrownRotate;

  const turn = (steps: number) => {
    if (!steps) return;
    setCrownAngle((a) => a - steps * 18);
    rotateRef.current?.(steps);
  };
  const turnRef = useRef(turn);
  turnRef.current = turn;

  // Responsive: scale the fixed-size device to fit narrow (phone) columns.
  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setScale(Math.min(1, Math.max(0.6, w / (CASE_W + 40))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Crown wheel: non-passive native listener so the page doesn't scroll.
  useEffect(() => {
    const el = crownRef.current;
    if (!el) return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      const steps = Math.trunc(acc / 40);
      if (steps !== 0) {
        acc -= steps * 40;
        // Wheel down (deltaY>0) == crown rolled toward the wrist == scroll down.
        turnRef.current(-steps);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Simulated haptic: short lateral case shake.
  useEffect(() => {
    if (!shake || shake.amp <= 0 || !caseScope.current || reducedMotion) return;
    const a = shake.amp;
    const frames: number[] = [0];
    for (let i = 0; i < shake.reps; i += 1) frames.push(-a, a, -a * 0.6, a * 0.6, 0);
    void animateCase(caseScope.current, { x: frames }, { duration: 0.14 * shake.reps + 0.05 });
  }, [shake?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Crown drag (vertical) = rotate; a click without drag = press.
  const drag = useRef<{ y: number; acc: number; moved: number } | null>(null);
  const onCrownPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { y: e.clientY, acc: 0, moved: 0 };
  };
  const onCrownPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    d.y = e.clientY;
    d.acc += dy;
    d.moved += Math.abs(dy);
    const steps = Math.trunc(d.acc / DETENT_PX);
    if (steps !== 0) {
      d.acc -= steps * DETENT_PX;
      turn(-steps);
    }
  };
  const onCrownPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved < 5) onCrownPress?.();
  };
  const onCrownKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onCrownPress?.();
    }
  };

  const onScreenPointerMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setGlare({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  const sideDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setSidePressed(true);
    onSideDown?.();
  };
  const sideUp = () => {
    // Read `sidePressed` directly rather than inside the setState updater:
    // React may invoke a functional updater eagerly (its bailout-equality
    // check) at the dispatchSetState call site, so a side effect placed
    // inside one can fire synchronously mid-render of a sibling/ancestor —
    // which is exactly what tripped the "update SmartWatch while rendering
    // WatchShell" warning here.
    if (sidePressed) onSideUp?.();
    setSidePressed(false);
  };

  const knurl = 'repeating-linear-gradient(0deg, #5b5f66 0 1.5px, #2a2d33 1.5px 3px)';

  return (
    <div ref={outerRef} className="w-full flex flex-col items-center select-none" data-testid="watch-shell">
      <div style={{ height: TOTAL_H * scale, width: (CASE_W + 40) * scale }} className="relative">
        <div
          className="absolute left-0 top-0 flex flex-col items-center"
          style={{ width: CASE_W + 40, transform: `scale(${scale})`, transformOrigin: 'top left' }}
        >
          {/* Top trail band */}
          <div
            aria-hidden
            className="relative z-[1]"
            style={{
              width: 214,
              height: BAND_H,
              marginBottom: -20,
              borderRadius: '30px 30px 6px 6px',
              background:
                'repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 2px, transparent 2px 5px), repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 4px), linear-gradient(90deg,#8a3a12,#c2541a 30%,#d8652a 50%,#c2541a 70%,#8a3a12)',
              boxShadow: 'inset 0 -14px 22px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.25)',
            }}
          />

          {/* Titanium case */}
          <motion.div
            ref={caseScope}
            className="relative z-[2]"
            style={{
              width: CASE_W,
              height: CASE_H,
              borderRadius: 74,
              padding: 14,
              background:
                'linear-gradient(145deg,#6f737a 0%,#3a3e45 22%,#25282d 55%,#41454c 82%,#7a7e85 100%)',
              boxShadow:
                '0 28px 60px -12px rgba(0,0,0,.75), 0 0 0 1px rgba(255,255,255,.06), inset 0 1px 1px rgba(255,255,255,.35), inset 0 -2px 3px rgba(0,0,0,.6)',
            }}
          >
            {/* Crown guard */}
            <div
              aria-hidden
              className="absolute"
              style={{
                right: -10,
                top: 108,
                width: 18,
                height: 92,
                borderRadius: 10,
                background: 'linear-gradient(90deg,#2b2e33,#5d6168 60%,#3a3d43)',
              }}
            />
            {/* Digital Crown */}
            <button
              ref={crownRef}
              type="button"
              aria-label="Digital Crown — turn to scroll, press for apps"
              data-testid="watch-crown"
              onPointerDown={onCrownPointerDown}
              onPointerMove={onCrownPointerMove}
              onPointerUp={onCrownPointerUp}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onCrownKey}
              className="absolute cursor-ns-resize touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400 active:translate-x-[-2px] transition-transform"
              style={{
                right: -22,
                top: 118,
                width: 30,
                height: 72,
                borderRadius: 9,
                backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.55), rgba(255,255,255,.18) 45%, rgba(0,0,0,.5)), ${knurl}`,
                backgroundPosition: `0 0, 0 ${crownAngle / 6}px`,
                boxShadow: '0 4px 10px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)',
              }}
            >
              <span
                aria-hidden
                className="absolute inset-y-[6px] -left-[3px] w-[4px] rounded-full"
                style={{ background: '#ff6a1a', boxShadow: '0 0 6px rgba(255,106,26,.7)' }}
              />
            </button>

            {/* Side button */}
            <button
              type="button"
              aria-label="Side button — press for quick panel, hold for SOS"
              data-testid="watch-sidebutton"
              onPointerDown={sideDown}
              onPointerUp={sideUp}
              onPointerCancel={sideUp}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute cursor-pointer touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"
              style={{
                right: sidePressed ? -6 : -9,
                top: 236,
                width: 14,
                height: 82,
                borderRadius: 7,
                transition: 'right 80ms',
                background: 'linear-gradient(90deg,#24272c,#61656c 55%,#34373d)',
                boxShadow: '0 3px 8px rgba(0,0,0,.55)',
              }}
            />

            {/* Display */}
            <div
              className="relative h-full w-full overflow-hidden"
              style={{
                borderRadius: 60,
                background: '#000',
                boxShadow: 'inset 0 0 0 2px #000, inset 0 0 0 4px #0d0f12, 0 0 0 1px rgba(0,0,0,.8)',
              }}
              onPointerMove={onScreenPointerMove}
            >
              <div
                data-testid="watch-screen"
                data-aod={aodMode ? 'true' : 'false'}
                className={`absolute inset-[6px] overflow-hidden transition-[filter] duration-300 ${
                  aodMode ? 'brightness-[0.7]' : ''
                }`}
                style={{ borderRadius: 54 }}
              >
                {children}
              </div>

              {edgeGlow && !aodMode && (
                <div
                  aria-hidden
                  data-testid="watch-edge-glow"
                  data-tone={edgeGlow}
                  className={`pointer-events-none absolute inset-[3px] ${reducedMotion ? '' : 'sg-edge-pulse'}`}
                  style={{
                    borderRadius: 57,
                    boxShadow:
                      edgeGlow === 'red'
                        ? 'inset 0 0 0 3px rgba(239,68,68,.9), inset 0 0 22px rgba(239,68,68,.55)'
                        : 'inset 0 0 0 2px rgba(245,158,11,.75), inset 0 0 14px rgba(245,158,11,.35)',
                  }}
                />
              )}

              {/* Sapphire glare */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  borderRadius: 60,
                  background: `radial-gradient(120% 70% at ${glare.x}% ${glare.y - 40}%, rgba(255,255,255,.09), transparent 55%), linear-gradient(160deg, rgba(255,255,255,.06) 0%, transparent 28%)`,
                  mixBlendMode: 'screen',
                }}
              />
            </div>
          </motion.div>

          {/* Bottom trail band */}
          <div
            aria-hidden
            className="relative z-[1]"
            style={{
              width: 214,
              height: BAND_H,
              marginTop: -20,
              borderRadius: '6px 6px 30px 30px',
              background:
                'repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 2px, transparent 2px 5px), repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 4px), linear-gradient(90deg,#8a3a12,#c2541a 30%,#d8652a 50%,#c2541a 70%,#8a3a12)',
              boxShadow: 'inset 0 14px 22px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.25)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
