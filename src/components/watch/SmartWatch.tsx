import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AppCarousel } from '../AppCarousel';
import { WatchFaceGauge } from '../WatchFaceGauge';
import { WatchShell, type ShakeSignal } from '../WatchShell';
import type { TemperatureUnit } from '../../shared/temperature';
import type { SupportedLanguage, WorkerStateSelf } from '../../shared/types';
import { AlertBanner, RedTakeover } from './AlertLayer';
import { anyFaultActive, diffWorkerStates, newSosCheckIn, type HapticPattern, type WatchAlert } from './alertDiff';
import { SHAKE, fireHaptic } from './haptics';
import {
  BreakScreen,
  ControlCenter,
  FacePicker,
  ForecastScreen,
  LauncherScreen,
  MinimalFace,
  ModularFace,
  NotificationCenter,
  QuickPanel,
  SosActive,
  SosCountdown,
  VitalsScreen,
  useNow,
  type AppId,
  type FaceStyle,
} from './screens';

type View =
  | 'home'
  | 'launcher'
  | 'cards'
  | 'alerts'
  | 'control'
  | 'quick'
  | 'facepicker'
  | 'sos-countdown'
  | 'sos-active';

/** Home pages reachable by swiping left/right from the watch face. */
const HOME_PAGES = ['face', 'vitals', 'forecast', 'break'] as const;
const FACES: FaceStyle[] = ['gauge', 'modular', 'minimal'];

const SOS_HOLD_MS = 1500;
const SOS_COUNTDOWN_MS = 3000;
const IDLE_DIM_MS = 15_000;
const RED_REPEAT_MS = 30_000;
const SWIPE_PX = 42;
const LONG_PRESS_MS = 650;

interface SmartWatchProps {
  workerState: WorkerStateSelf;
  aodMode: boolean;
  onAodChange: (v: boolean) => void;
  onCheckIn: (status: 'okay' | 'help') => void;
  checkInSending: 'okay' | 'help' | null;
  onLanguageChange: (l: SupportedLanguage) => void;
  tempUnit: TemperatureUnit;
}

function readAutoDimDefault(): boolean {
  try {
    const v = window.localStorage.getItem('sg_watch_autodim');
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  // Automated browsers (Playwright) idle for long stretches between asserts;
  // dimming mid-test would hide the face. Humans get the realistic default.
  return !(typeof navigator !== 'undefined' && navigator.webdriver);
}

/**
 * Interactive smartwatch simulator. Owns navigation, gestures, the live
 * alert queue and simulated haptics; every number it shows comes from
 * `workerState` (the API payload) via the screens it renders.
 */
export function SmartWatch({
  workerState,
  aodMode,
  onAodChange,
  onCheckIn,
  checkInSending,
  onLanguageChange,
  tempUnit,
}: SmartWatchProps) {
  const reducedMotion = !!useReducedMotion();
  const now = useNow();

  const [view, setView] = useState<View>('home');
  const [page, setPage] = useState(0);
  const [pageDir, setPageDir] = useState(1);
  const [faceStyle, setFaceStyle] = useState<FaceStyle>('gauge');
  const [pickerIdx, setPickerIdx] = useState(0);

  const [queue, setQueue] = useState<WatchAlert[]>([]);
  const [history, setHistory] = useState<WatchAlert[]>([]);
  const [unread, setUnread] = useState(0);

  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(false);
  const [autoDim, setAutoDim] = useState(readAutoDimDefault);
  const [shake, setShake] = useState<ShakeSignal | null>(null);

  const [sosStart, setSosStart] = useState<number | null>(null);
  const [sideHoldStart, setSideHoldStart] = useState<number | null>(null);
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  const [localWater, setLocalWater] = useState(0);
  const [liveMsg, setLiveMsg] = useState('');

  const lang = workerState.context.preferredLanguage;
  const copy = workerState.alertTranslations[lang] ?? workerState.alertTranslations.en;
  const dir: 'ltr' | 'rtl' = lang === 'ur' ? 'rtl' : 'ltr';
  const tier = workerState.assessment.tier;
  const degraded = anyFaultActive(workerState);

  const hapticsRef = useRef({ vibrate: haptics, sound });
  hapticsRef.current = { vibrate: haptics, sound };

  const buzz = useCallback((p: HapticPattern) => {
    fireHaptic(p, hapticsRef.current);
    const s = SHAKE[p];
    if (s.amp > 0) setShake({ key: Date.now() + Math.random(), amp: s.amp, reps: s.reps });
  }, []);

  /* ── wake / idle ─────────────────────────────────────────────── */
  const lastActive = useRef(Date.now());
  const aodRef = useRef(aodMode);
  aodRef.current = aodMode;
  const wake = useCallback(() => {
    lastActive.current = Date.now();
    if (aodRef.current) onAodChange(false);
  }, [onAodChange]);

  useEffect(() => {
    const mark = () => (lastActive.current = Date.now());
    document.addEventListener('pointerdown', mark, true);
    document.addEventListener('keydown', mark, true);
    document.addEventListener('wheel', mark, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', mark, true);
      document.removeEventListener('keydown', mark, true);
      document.removeEventListener('wheel', mark, true);
    };
  }, []);

  /* ── live alert diffing ──────────────────────────────────────── */
  const prevState = useRef<WorkerStateSelf | null>(null);
  useEffect(() => {
    const prev = prevState.current;
    prevState.current = workerState;
    if (prev === workerState) return;

    const alerts = diffWorkerStates(prev, workerState, copy);

    if (prev && prev.assessment.tier !== workerState.assessment.tier) {
      setLiveMsg(`Heat strain tier now ${workerState.assessment.tier}. ${copy.action}`);
    }

    setQueue((q) => {
      let nq = q;
      // A Red takeover is moot once the engine itself says we're no longer Red.
      if (workerState.assessment.tier !== 'Red') nq = nq.filter((a) => a.kind !== 'red');
      if (!alerts.length) return nq;
      const incomingKinds = new Set(alerts.map((a) => a.kind));
      nq = nq.filter((a) => !incomingKinds.has(a.kind));
      // A Red takeover supersedes any still-pending lower-tier heat warnings.
      if (incomingKinds.has('red')) {
        nq = nq.filter((a) => a.kind !== 'amber' && a.kind !== 'prewarn-amber' && a.kind !== 'prewarn-red');
      }
      // Red always on top; otherwise the newest notification pre-empts older
      // banners (like a real watch), ties broken by priority.
      return [...nq, ...alerts].sort(
        (a, b) =>
          Number(b.kind === 'red') - Number(a.kind === 'red') ||
          b.createdAt - a.createdAt ||
          b.priority - a.priority
      );
    });

    if (alerts.length) {
      setHistory((h) => [...alerts, ...h].slice(0, 40));
      setUnread((u) => u + alerts.length);
      wake();
      const top = alerts[0];
      if (top.haptic) buzz(top.haptic);
      if (top.kind === 'red') {
        setSosStart(null);
        if (view === 'facepicker' || view === 'quick') setView('home');
      }
      setLiveMsg(`${top.title}. ${top.body}`);
    }

    if (prev && newSosCheckIn(prev, workerState)) {
      setSosStart(null);
      setView('sos-active');
    }
    if (prev && prev.lastCheckIn?.status === 'help' && workerState.lastCheckIn?.status === 'okay') {
      if (view === 'sos-active') setView('home');
    }
  }, [workerState]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = queue[0] ?? null;

  // Auto-collapse banners.
  useEffect(() => {
    if (!active || active.requiresAck || active.autoDismissMs <= 0) return;
    const id = window.setTimeout(
      () => setQueue((q) => q.filter((a) => a.id !== active.id)),
      active.autoDismissMs
    );
    return () => window.clearTimeout(id);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Red keeps nagging until acknowledged (like a real fall/heart alert).
  useEffect(() => {
    if (!active || active.kind !== 'red') return;
    const id = window.setInterval(() => {
      wake();
      buzz('triple-long');
    }, RED_REPEAT_MS);
    return () => window.clearInterval(id);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrist-down auto dim.
  useEffect(() => {
    if (!autoDim) return;
    const id = window.setInterval(() => {
      if (aodRef.current || queue.length || sosStart || view === 'sos-active') return;
      if (Date.now() - lastActive.current > IDLE_DIM_MS) {
        onAodChange(true);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [autoDim, queue.length, sosStart, view, onAodChange]);

  const dismissActive = () => active && setQueue((q) => q.filter((a) => a.id !== active.id));

  /* ── SOS ─────────────────────────────────────────────────────── */
  const startSos = useCallback(() => {
    setQueue((q) => q.filter((a) => a.kind !== 'red'));
    setSosStart(Date.now());
    setView('sos-countdown');
    buzz('double');
  }, [buzz]);

  useEffect(() => {
    if (!sosStart) return;
    const id = window.setTimeout(() => {
      setSosStart(null);
      setView('sos-active');
      buzz('triple-long');
      onCheckIn('help');
    }, SOS_COUNTDOWN_MS);
    return () => window.clearTimeout(id);
  }, [sosStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelSos = () => {
    setSosStart(null);
    setView('home');
    setPage(0);
  };
  const sendSosNow = () => {
    setSosStart(null);
    setView('sos-active');
    buzz('triple-long');
    onCheckIn('help');
  };

  /* ── hardware input ──────────────────────────────────────────── */
  const goHome = (p = 0) => {
    setView('home');
    setPageDir(p >= page ? 1 : -1);
    setPage(p);
  };

  const crownPress = () => {
    wake();
    if (active?.requiresAck) {
      buzz('single');
      return;
    }
    if (view === 'sos-countdown') return;
    buzz('tick');
    if (view === 'home' && page === 0) setView('launcher');
    else goHome(0);
  };

  const scrollEl = useRef<HTMLDivElement | null>(null);
  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    if (el) scrollEl.current = el;
    else if (scrollEl.current && !scrollEl.current.isConnected) scrollEl.current = null;
  }, []);
  const pageAcc = useRef(0);

  const crownRotate = (steps: number) => {
    wake();
    fireHaptic('tick', hapticsRef.current);
    if (active?.requiresAck || view === 'sos-countdown') return;
    if (view === 'facepicker') {
      setPickerIdx((i) => Math.max(0, Math.min(FACES.length - 1, i - Math.sign(steps))));
      return;
    }
    const el = scrollEl.current;
    const onFace = view === 'home' && page === 0;
    if (!onFace && el && el.isConnected && el.scrollHeight > el.clientHeight + 2) {
      el.scrollBy({ top: -steps * 44, behavior: reducedMotion ? 'auto' : 'smooth' });
      return;
    }
    if (view === 'home') {
      pageAcc.current += steps;
      if (Math.abs(pageAcc.current) >= 2) {
        const delta = pageAcc.current < 0 ? 1 : -1;
        pageAcc.current = 0;
        const np = Math.max(0, Math.min(HOME_PAGES.length - 1, page + delta));
        if (np !== page) {
          setPageDir(delta);
          setPage(np);
        }
      }
    }
  };

  const sideTimer = useRef<number | null>(null);
  const sideFired = useRef(false);
  const sideStartRef = useRef(0);
  const sideDown = () => {
    wake();
    sideFired.current = false;
    sideStartRef.current = Date.now();
    setSideHoldStart(Date.now());
    if (sideTimer.current) window.clearTimeout(sideTimer.current);
    sideTimer.current = window.setTimeout(() => {
      sideFired.current = true;
      setSideHoldStart(null);
      startSos();
    }, SOS_HOLD_MS);
  };
  const sideUp = () => {
    if (sideTimer.current) window.clearTimeout(sideTimer.current);
    sideTimer.current = null;
    setSideHoldStart(null);
    if (sideFired.current) return;
    if (Date.now() - sideStartRef.current < 450) {
      if (active?.requiresAck || view === 'sos-countdown') return;
      buzz('tick');
      setView((v) => (v === 'quick' ? 'home' : 'quick'));
    }
  };

  /* ── touch gestures on the display ───────────────────────────── */
  const gesture = useRef<{ x: number; y: number; relY: number; moved: boolean; onBanner: boolean } | null>(null);
  const longTimer = useRef<number | null>(null);
  const swallowClick = useRef(false);

  const onScreenPointerDown = (e: React.PointerEvent) => {
    lastActive.current = Date.now();
    if (aodRef.current) {
      onAodChange(false);
      swallowClick.current = true;
      gesture.current = null;
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const target = e.target as HTMLElement;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      relY: (e.clientY - r.top) / r.height,
      moved: false,
      onBanner: !!target.closest('[data-testid="watch-alert-banner"]'),
    };
    if (view === 'home' && page === 0 && !active?.requiresAck && !gesture.current.onBanner && !target.closest('button')) {
      if (longTimer.current) window.clearTimeout(longTimer.current);
      longTimer.current = window.setTimeout(() => {
        longTimer.current = null;
        if (gesture.current && !gesture.current.moved) {
          swallowClick.current = true;
          gesture.current = null;
          buzz('single');
          setPickerIdx(FACES.indexOf(faceStyle));
          setView('facepicker');
        }
      }, LONG_PRESS_MS);
    }
  };

  const onScreenPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) {
      g.moved = true;
      if (longTimer.current) {
        window.clearTimeout(longTimer.current);
        longTimer.current = null;
      }
    }
  };

  const onScreenPointerUp = (e: React.PointerEvent) => {
    if (longTimer.current) {
      window.clearTimeout(longTimer.current);
      longTimer.current = null;
    }
    const g = gesture.current;
    gesture.current = null;
    if (!g || !g.moved) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    swallowClick.current = true;
    if (active?.requiresAck || view === 'sos-countdown' || view === 'sos-active') return;
    if (g.onBanner) {
      dismissActive(); // flick a banner away
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) swipeHorizontal(dx < 0 ? 'left' : 'right');
    else swipeVertical(dy > 0 ? 'down' : 'up', g.relY);
  };

  const swipeHorizontal = (d: 'left' | 'right') => {
    const delta = d === 'left' ? 1 : -1;
    if (view === 'facepicker') {
      setPickerIdx((i) => Math.max(0, Math.min(FACES.length - 1, i + delta)));
      buzz('tick');
      return;
    }
    if (view === 'home') {
      const np = Math.max(0, Math.min(HOME_PAGES.length - 1, page + delta));
      if (np !== page) {
        setPageDir(delta);
        setPage(np);
        buzz('tick');
      }
      return;
    }
    if (d === 'right') goHome(0); // edge-swipe back
  };

  const swipeVertical = (d: 'down' | 'up', relY: number) => {
    const onFace = view === 'home' && page === 0;
    if (view === 'alerts' && d === 'up') return goHome(0);
    if (view === 'control' && d === 'down') return goHome(0);
    if (d === 'down' && (onFace || relY < 0.15)) {
      setView('alerts');
      setUnread(0);
      buzz('tick');
    } else if (d === 'up' && (onFace || relY > 0.85)) {
      setView('control');
      buzz('tick');
    }
  };

  const onScreenClickCapture = (e: React.MouseEvent) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  /* ── keyboard (role=application) ─────────────────────────────── */
  const keyHeld = useRef(false);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      handled();
      crownRotate(k === 'ArrowUp' ? 1 : -1);
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      handled();
      wake();
      if (!active?.requiresAck) swipeHorizontal(k === 'ArrowRight' ? 'left' : 'right');
    } else if (k === 'Enter' && e.target === e.currentTarget) {
      handled();
      crownPress();
    } else if (k === 'Escape') {
      handled();
      if (sosStart) cancelSos();
      else if (view !== 'home' || page !== 0) goHome(0);
      else if (active && !active.requiresAck) dismissActive();
    } else if ((k === 's' || k === 'S') && !e.repeat && !keyHeld.current) {
      handled();
      keyHeld.current = true;
      sideDown();
    } else if (k === 'n' || k === 'N') {
      handled();
      wake();
      setView('alerts');
      setUnread(0);
    } else if (k === 'c' || k === 'C') {
      handled();
      wake();
      setView('control');
    }
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if ((e.key === 's' || e.key === 'S') && keyHeld.current) {
      keyHeld.current = false;
      sideUp();
    }
  };

  /* ── app launcher routing ────────────────────────────────────── */
  const openApp = (id: AppId) => {
    buzz('tick');
    switch (id) {
      case 'gauge':
        return goHome(0);
      case 'vitals':
        return goHome(1);
      case 'forecast':
        return goHome(2);
      case 'break':
        return goHome(3);
      case 'alerts':
        setUnread(0);
        return setView('alerts');
      case 'sos':
        return startSos();
      case 'cards':
        return setView('cards');
      case 'settings':
        return setView('control');
    }
  };

  const logWater = () => {
    setLocalWater((n) => n + 1);
    buzz('soft');
  };

  /* ── render ──────────────────────────────────────────────────── */
  const ackRed = () => {
    dismissActive();
    buzz('single');
    goHome(0);
  };

  const renderFace = (): ReactNode => {
    if (faceStyle === 'modular') return <ModularFace state={workerState} now={now} tempUnit={tempUnit} />;
    if (faceStyle === 'minimal') return <MinimalFace state={workerState} now={now} />;
    return <WatchFaceGauge workerState={workerState} aodMode={false} onToggleAod={() => onAodChange(true)} />;
  };

  let screenKey: string = view;
  let content: ReactNode = null;
  let motionProps: Record<string, unknown> = {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1.02 },
  };

  if (aodMode) {
    screenKey = 'aod';
    content = (
      <WatchFaceGauge workerState={workerState} aodMode onToggleAod={() => onAodChange(false)} />
    );
    motionProps = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  } else if (view === 'home') {
    screenKey = `home-${page}-${page === 0 ? faceStyle : ''}`;
    const pg = HOME_PAGES[page];
    content =
      pg === 'face' ? (
        renderFace()
      ) : pg === 'vitals' ? (
        <VitalsScreen
          state={workerState}
          scrollRef={setScrollEl}
          now={now}
          tempUnit={tempUnit}
          reducedMotion={reducedMotion}
          onBack={() => goHome(0)}
        />
      ) : pg === 'forecast' ? (
        <ForecastScreen state={workerState} scrollRef={setScrollEl} now={now} onBack={() => goHome(0)} />
      ) : (
        <BreakScreen
          state={workerState}
          scrollRef={setScrollEl}
          now={now}
          onBack={() => goHome(0)}
          localWater={localWater}
          onLogWater={logWater}
          breakEndsAt={breakEndsAt}
          onStartBreak={() => {
            setBreakEndsAt(Date.now() + 15 * 60_000);
            buzz('single');
          }}
          onCancelBreak={() => setBreakEndsAt(null)}
        />
      );
    motionProps = {
      custom: pageDir,
      initial: { x: pageDir * 120, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: -pageDir * 120, opacity: 0 },
    };
  } else if (view === 'launcher') {
    content = <LauncherScreen scrollRef={setScrollEl} now={now} unread={unread} onOpen={openApp} />;
    motionProps = {
      initial: { opacity: 0, scale: 1.25 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 1.25 },
    };
  } else if (view === 'cards') {
    content = (
      <div ref={setScrollEl} data-scrollable="true" className="h-full overflow-y-auto [scrollbar-width:none] pt-6">
        <AppCarousel workerState={workerState} onClose={() => goHome(0)} />
      </div>
    );
  } else if (view === 'alerts') {
    content = (
      <NotificationCenter
        items={history}
        scrollRef={setScrollEl}
        now={now}
        dir={dir}
        onClear={() => {
          setHistory([]);
          setUnread(0);
        }}
        onClose={() => goHome(0)}
      />
    );
    motionProps = { initial: { y: '-100%' }, animate: { y: 0 }, exit: { y: '-100%' } };
  } else if (view === 'control') {
    content = (
      <ControlCenter
        state={workerState}
        scrollRef={setScrollEl}
        now={now}
        aod={aodMode}
        haptics={haptics}
        sound={sound}
        autoDim={autoDim}
        onToggleAod={() => onAodChange(!aodMode)}
        onToggleHaptics={() => setHaptics((v) => !v)}
        onToggleSound={() => {
          setSound((v) => {
            if (!v) fireHaptic('soft', { vibrate: false, sound: true });
            return !v;
          });
        }}
        onToggleAutoDim={() => {
          setAutoDim((v) => {
            try {
              window.localStorage.setItem('sg_watch_autodim', v ? '0' : '1');
            } catch {
              /* ignore */
            }
            return !v;
          });
        }}
        onLanguage={(l) => onLanguageChange(l)}
        onClose={() => goHome(0)}
      />
    );
    motionProps = { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } };
  } else if (view === 'quick') {
    content = (
      <QuickPanel
        state={workerState}
        now={now}
        sending={checkInSending !== null}
        onSafe={() => {
          onCheckIn('okay');
          buzz('single');
          goHome(0);
        }}
        onWater={logWater}
        onAlerts={() => {
          setUnread(0);
          setView('alerts');
        }}
        onClose={() => goHome(0)}
      />
    );
    motionProps = { initial: { x: 140, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: 140, opacity: 0 } };
  } else if (view === 'facepicker') {
    content = (
      <FacePicker
        current={faceStyle}
        state={workerState}
        now={now}
        tempUnit={tempUnit}
        highlight={pickerIdx}
        onPick={(f) => {
          setFaceStyle(f);
          buzz('single');
          goHome(0);
        }}
      />
    );
    motionProps = { initial: { scale: 1.15, opacity: 0 }, animate: { scale: 1, opacity: 1 }, exit: { scale: 1.1, opacity: 0 } };
  } else if (view === 'sos-countdown' && sosStart) {
    content = (
      <SosCountdown startedAt={sosStart} durationMs={SOS_COUNTDOWN_MS} onCancel={cancelSos} onSendNow={sendSosNow} />
    );
  } else if (view === 'sos-active') {
    content = (
      <SosActive
        state={workerState}
        sending={checkInSending !== null}
        reducedMotion={reducedMotion}
        onSafe={() => {
          onCheckIn('okay');
          buzz('single');
        }}
        onClose={() => goHome(0)}
      />
    );
  } else {
    screenKey = 'fallback';
    content = renderFace();
  }

  const scrollableView = !aodMode && !(view === 'home' && page === 0) && view !== 'facepicker' && view !== 'sos-countdown';
  const edgeGlow = aodMode || degraded ? null : tier === 'Red' ? 'red' : tier === 'Amber' ? 'amber' : null;

  return (
    <div className="w-full flex flex-col items-center">
      <div
        role="application"
        aria-label="SiteGuard smartwatch simulator. Arrow up/down turns crown, Enter presses crown, left/right swipes, S taps or holds side button, N notifications, C control centre."
        aria-roledescription="smartwatch"
        tabIndex={0}
        data-testid="smartwatch"
        data-view={aodMode ? 'aod' : view}
        data-page={page}
        data-face={faceStyle}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className="w-full outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 rounded-[40px]"
      >
        <WatchShell
          aodMode={aodMode}
          onCrownRotate={crownRotate}
          onCrownPress={crownPress}
          onSideDown={sideDown}
          onSideUp={sideUp}
          shake={shake}
          edgeGlow={edgeGlow}
          reducedMotion={reducedMotion}
        >
          <div
            data-testid="watch-gesture-layer"
            className="relative h-full w-full bg-black overflow-hidden select-none"
            style={{ touchAction: scrollableView ? 'pan-y' : 'none' }}
            onPointerDown={onScreenPointerDown}
            onPointerMove={onScreenPointerMove}
            onPointerUp={onScreenPointerUp}
            onPointerCancel={() => {
              gesture.current = null;
              if (longTimer.current) window.clearTimeout(longTimer.current);
            }}
            onClickCapture={onScreenClickCapture}
            onDragStart={(e) => e.preventDefault()}
          >
            <AnimatePresence initial={false} custom={pageDir}>
              <motion.div
                key={screenKey}
                className="absolute inset-0"
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
                {...motionProps}
              >
                {content}
              </motion.div>
            </AnimatePresence>

            {/* Page dots on the home carousel */}
            {!aodMode && view === 'home' && (
              <div className="pointer-events-none absolute bottom-2.5 left-0 right-0 flex justify-center gap-1.5 z-20">
                {HOME_PAGES.map((p, i) => (
                  <span
                    key={p}
                    data-testid="page-dot"
                    className="w-[6px] h-[6px] rounded-full transition-colors"
                    style={{ background: i === page ? '#fff' : 'rgba(255,255,255,.28)' }}
                  />
                ))}
              </div>
            )}

            {/* Side-button hold progress */}
            <AnimatePresence>
              {sideHoldStart && (
                <motion.div
                  key="side-hold"
                  data-testid="sos-hold-hint"
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-40 flex items-center gap-2 rounded-full bg-[#2c0606]/95 pl-3 pr-1.5 py-1.5"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: 0.2, duration: 0.15 }}
                >
                  <span className="text-[12px] font-semibold text-[#ff6961]">Hold for SOS</span>
                  <svg viewBox="0 0 28 28" className="w-7 h-7">
                    <circle cx={14} cy={14} r={11} stroke="#4a0d0d" strokeWidth={4} fill="none" />
                    <motion.circle
                      cx={14}
                      cy={14}
                      r={11}
                      stroke="#ff3b30"
                      strokeWidth={4}
                      fill="none"
                      strokeLinecap="round"
                      transform="rotate(-90 14 14)"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: SOS_HOLD_MS / 1000, ease: 'linear' }}
                    />
                  </svg>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live alerts */}
            <AnimatePresence>
              {!aodMode && active && view !== 'sos-countdown' && view !== 'sos-active' &&
                (active.requiresAck ? (
                  <RedTakeover
                    key={active.id}
                    alert={active}
                    dir={dir}
                    reducedMotion={reducedMotion}
                    onAck={ackRed}
                    onSos={startSos}
                  />
                ) : (
                  <AlertBanner
                    key={active.id}
                    alert={active}
                    dir={dir}
                    reducedMotion={reducedMotion}
                    onDismiss={dismissActive}
                  />
                ))}
            </AnimatePresence>
          </div>
        </WatchShell>
      </div>

      {/* Screen-reader announcements for tier changes (no role=status: one already exists on the page). */}
      <div aria-live="assertive" className="sr-only" data-testid="watch-live-region">
        {liveMsg}
      </div>

      <div className="mt-3 flex flex-wrap justify-center gap-1.5 max-w-[420px]" aria-hidden>
        {[
          'Turn / drag crown',
          'Press crown · apps',
          'Swipe ← → pages',
          'Swipe ↓ alerts · ↑ controls',
          'Long-press face',
          'Hold side button · SOS',
        ].map((t) => (
          <span key={t} className="px-2 py-1 rounded-full border border-white/10 bg-white/[0.03] text-[10.5px] font-mono text-slate-400">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
