import { type ReactNode, useCallback, useRef } from 'react';

interface WatchShellProps {
  children: ReactNode;
  aodMode: boolean;
  onCrownTap?: () => void;
  onSideButtonHold?: () => void;
}

/**
 * Apple-Watch-style case chrome: rounded-rect aluminum case, Digital Crown,
 * side button, silicone band top/bottom. Purely a visual + interaction
 * wrapper — the screen content (WatchFaceGauge / AppCarousel) is passed in
 * as children and untouched, so existing data-testids / e2e assertions on
 * the gauge keep working unchanged.
 */
export function WatchShell({ children, aodMode, onCrownTap, onSideButtonHold }: WatchShellProps) {
  const holdTimer = useRef<number | null>(null);
  const firedRef = useRef(false);

  const startHold = useCallback(() => {
    if (!onSideButtonHold) return;
    firedRef.current = false;
    holdTimer.current = window.setTimeout(() => {
      firedRef.current = true;
      onSideButtonHold();
    }, 600);
  }, [onSideButtonHold]);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  return (
    <div className="flex flex-col items-center select-none" data-testid="watch-shell">
      {/* Top silicone band */}
      <div
        className="w-[170px] h-[64px] -mb-[16px] z-[1]"
        style={{
          background: 'linear-gradient(100deg,#5b6b85,#46536b 60%,#3c4760)',
          borderRadius: '36px 36px 10px 10px',
        }}
      />

      {/* Aluminum case */}
      <div
        className="relative z-[2] p-[11px]"
        style={{
          width: 374,
          borderRadius: 60,
          background: 'linear-gradient(135deg,#f4f5f6,#d9dbde 45%,#eceeef)',
          boxShadow: '0 14px 34px rgba(0,0,0,.45), inset 0 0 0 1px #c7c9cc',
        }}
      >
        {/* Digital Crown — tap opens the App Carousel */}
        <button
          type="button"
          aria-label="Digital Crown — tap for App Carousel"
          data-testid="watch-crown"
          onClick={onCrownTap}
          className="absolute -right-[15px] top-[28%] w-[30px] h-[30px] rounded-full cursor-pointer"
          style={{
            background:
              'repeating-linear-gradient(0deg,#d2d4d7 0 2px,#a7a9ac 2px 3px), linear-gradient(145deg,#f0f1f2,#c3c5c8)',
            backgroundBlendMode: 'overlay',
            boxShadow: '0 2px 6px rgba(0,0,0,.4), inset 0 0 0 1px #b9bbbe',
          }}
        />

        {/* Side button — hold 600ms triggers SOS ("Need Help") */}
        <button
          type="button"
          aria-label="Side button — hold for SOS"
          data-testid="watch-sidebutton"
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          className="absolute -right-[9px] w-[10px] h-[52px] rounded-[5px] cursor-pointer"
          style={{
            top: 'calc(28% + 48px)',
            background: 'linear-gradient(90deg,#e7e8ea,#b9bbbe)',
            boxShadow: '0 2px 4px rgba(0,0,0,.35)',
          }}
        />

        {/* Screen */}
        <div
          data-testid="watch-screen"
          className={`rounded-[48px] overflow-hidden border-[3px] border-black transition-[filter] duration-500 ${
            aodMode ? 'grayscale brightness-[0.55]' : ''
          }`}
        >
          {children}
        </div>
      </div>

      {/* Bottom silicone band */}
      <div
        className="w-[170px] h-[64px] -mt-[16px] z-[1]"
        style={{
          background: 'linear-gradient(100deg,#5b6b85,#46536b 60%,#3c4760)',
          borderRadius: '10px 10px 36px 36px',
        }}
      />

      <p className="mt-3 text-[11px] font-mono text-slate-400 text-center">
        ⌘ Tap crown for App Carousel · Hold side button for SOS
      </p>
    </div>
  );
}
