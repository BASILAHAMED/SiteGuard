import { motion } from 'motion/react';
import { OctagonAlert, Siren, X } from 'lucide-react';
import type { WatchAlert } from './alertDiff';
import { WATCH_FONT, alertIcon } from './screens';

const TONE: Record<WatchAlert['tone'], { fg: string; bg: string; ring: string }> = {
  red: { fg: '#ff453a', bg: 'rgba(60,8,8,.96)', ring: 'rgba(255,69,58,.55)' },
  amber: { fg: '#ff9f0a', bg: 'rgba(48,30,4,.96)', ring: 'rgba(255,159,10,.5)' },
  grey: { fg: '#aeaeb2', bg: 'rgba(36,36,38,.97)', ring: 'rgba(142,142,147,.45)' },
  sky: { fg: '#64d2ff', bg: 'rgba(6,32,48,.96)', ring: 'rgba(100,210,255,.45)' },
  green: { fg: '#30d158', bg: 'rgba(6,40,16,.96)', ring: 'rgba(48,209,88,.45)' },
};

/** Full-screen Red stop-work takeover. Requires an explicit acknowledgement. */
export function RedTakeover({
  alert,
  dir,
  reducedMotion,
  onAck,
  onSos,
}: {
  alert: WatchAlert;
  dir: 'ltr' | 'rtl';
  reducedMotion: boolean;
  onAck: () => void;
  onSos: () => void;
}) {
  return (
    <motion.div
      key={alert.id}
      data-testid="watch-alert-red"
      role="alertdialog"
      aria-label="Stop work alert"
      initial={{ opacity: 0, scale: 1.08 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: reducedMotion ? 0 : 0.28, ease: 'easeOut' }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center px-7 text-center text-white"
      style={{
        fontFamily: WATCH_FONT,
        background: 'radial-gradient(120% 90% at 50% 30%, #7a0f0f 0%, #3a0505 55%, #120000 100%)',
      }}
    >
      <div className="relative w-[92px] h-[92px] flex items-center justify-center">
        {!reducedMotion && <span className="absolute inset-0 rounded-full bg-[#ff453a]/35 sg-sos-ripple" />}
        <span className="relative w-[76px] h-[76px] rounded-full bg-[#ff453a] flex items-center justify-center shadow-[0_0_30px_rgba(255,69,58,.6)]">
          <OctagonAlert className="w-10 h-10" />
        </span>
      </div>
      <div className="mt-3 text-[34px] leading-none font-extrabold tracking-tight">{alert.title}</div>
      <div className="mt-1 text-[14px] font-semibold uppercase tracking-[0.16em] text-[#ff9a93]">Move to shade now</div>
      <p dir={dir} className="mt-2 text-[14px] leading-snug text-[#ffd9d6] line-clamp-4">
        {alert.body}
      </p>
      <div className="mt-4 flex gap-2 w-full">
        <button
          type="button"
          data-testid="alert-ack"
          onClick={onAck}
          aria-label="Acknowledge stop-work alert"
          className="flex-1 rounded-full bg-white text-black py-3 text-[16px] font-bold cursor-pointer active:scale-[0.98]"
        >
          Acknowledge
        </button>
        <button
          type="button"
          data-testid="alert-sos"
          onClick={onSos}
          aria-label="Start emergency SOS"
          className="rounded-full bg-[#ff3b30] w-[52px] flex items-center justify-center cursor-pointer active:scale-95"
        >
          <Siren className="w-6 h-6" />
        </button>
      </div>
    </motion.div>
  );
}

/** Drop-down notification banner (Amber, pre-warnings, faults, supervisor). */
export function AlertBanner({
  alert,
  dir,
  reducedMotion,
  onDismiss,
}: {
  alert: WatchAlert;
  dir: 'ltr' | 'rtl';
  reducedMotion: boolean;
  onDismiss: () => void;
}) {
  const t = TONE[alert.tone];
  return (
    <motion.div
      key={alert.id}
      data-testid="watch-alert-banner"
      data-kind={alert.kind}
      role="alert"
      initial={{ y: -140, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -140, opacity: 0 }}
      transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
      className="absolute left-3 right-3 top-3 z-30 rounded-[30px] px-4 pt-4 pb-3.5 text-white"
      style={{
        fontFamily: WATCH_FONT,
        background: t.bg,
        boxShadow: `0 0 0 1.5px ${t.ring}, 0 18px 40px rgba(0,0,0,.6)`,
        backdropFilter: 'blur(14px)',
      }}
      onClick={onDismiss}
    >
      <div className="flex items-center gap-2 px-4">
        <span
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: t.fg, color: '#000' }}
        >
          {alertIcon(alert, 'w-[18px] h-[18px]')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.fg }}>
            SiteGuard · now
          </div>
          <div className="text-[17px] font-bold leading-tight truncate">{alert.title}</div>
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p dir={dir} className="mt-2 px-1 text-[14px] leading-snug text-white/85 line-clamp-3">
        {alert.body}
      </p>
      {alert.autoDismissMs > 0 && !reducedMotion && (
        <div className="mt-2.5 mx-1 h-[3px] rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: t.fg }}
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: alert.autoDismissMs / 1000, ease: 'linear' }}
          />
        </div>
      )}
    </motion.div>
  );
}
