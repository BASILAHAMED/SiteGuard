import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  Clock,
  Droplets,
  OctagonAlert,
  TrendingUp,
} from 'lucide-react';
import type { WorkerStateSelf } from '../shared/types';

interface AppCarouselProps {
  workerState: WorkerStateSelf;
  onClose: () => void;
  onNavigateForecast: () => void;
}

interface CarouselCardItem {
  id: string;
  label: string;
  value: string;
  sublabel: string;
  badgeClass: string;
  valueClass?: string;
  isStopWork?: boolean;
  isForecast?: boolean;
  Icon: typeof Activity;
}

export function AppCarousel({
  workerState,
  onClose,
  onNavigateForecast,
}: AppCarouselProps) {
  const { context, assessment, forecast } = workerState;
  const isRedTier = assessment.tier === 'Red';
  const defaultFocusIndex = isRedTier ? 3 : 2;

  const [focusedIndex, setFocusedIndex] = useState<number>(defaultFocusIndex);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isProgrammaticScrollRef = useRef(false);
  const programmaticTargetTopRef = useRef<number | null>(null);

  const forecastSummary =
    forecast.status === 'ready' && forecast.psi15
      ? `t+15m ${forecast.psi15.point.toFixed(1)} · ${
          forecast.projectedAmberCrossingMin === 0
            ? 'Amber Reached'
            : forecast.projectedAmberCrossingMin !== null
              ? `Amber ~${forecast.projectedAmberCrossingMin}m`
              : 'Stable'
        }`
      : 'Collecting trend data';

  const cards: CarouselCardItem[] = [
    {
      id: 'composite-strain',
      label: 'Composite Strain',
      value: `${assessment.compositeScore.toFixed(1)} / 10`,
      sublabel: `${assessment.tier} Tier · ${
        assessment.psi !== null ? `PSI ${assessment.psi.toFixed(1)}` : 'Env-Only Mode'
      }`,
      badgeClass: 'bg-[#787aff]/20 text-[#787aff]',
      Icon: Activity,
    },
    {
      id: 'next-break',
      label: 'Next Break',
      value: `${context.plannedBreakTime} GST`,
      sublabel: 'UAE Midday Window 12:30–15:00',
      badgeClass: 'bg-sky-500/20 text-sky-400',
      Icon: Clock,
    },
    {
      id: 'heat-risk-forecast',
      label: 'Heat Risk Forecast',
      value: forecastSummary,
      sublabel: 'Tap to inspect 30-min trajectory',
      badgeClass: 'bg-[#787aff]/20 text-[#787aff]',
      isForecast: true,
      Icon: TrendingUp,
    },
    {
      id: 'stop-work-alert',
      label: 'Stop-Work Alert',
      value: isRedTier ? 'ACTIVE — STOP WORK' : 'None active',
      sublabel: isRedTier
        ? 'Red critical strain: move to AC recovery'
        : 'Threshold not breached',
      badgeClass: isRedTier ? 'bg-[#fa114f]/20 text-[#fa114f]' : 'bg-zinc-700/60 text-zinc-400',
      valueClass: isRedTier ? 'text-[#fa114f]' : 'text-white',
      isStopWork: true,
      Icon: OctagonAlert,
    },
    {
      id: 'hydration',
      label: 'Hydration',
      value: `${context.hydrationCount} logged`,
      sublabel: `Breaks taken today: ${context.breaksTakenTodayMin} min`,
      badgeClass: 'bg-emerald-500/20 text-emerald-400',
      Icon: Droplets,
    },
  ];

  const centerCardAtIndex = useCallback((idx: number, smooth = true) => {
    const container = scrollContainerRef.current;
    const cardEl = cardRefs.current[idx];
    if (!container || !cardEl) return;

    const containerRect = container.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const delta =
      cardRect.top + cardRect.height / 2 - (containerRect.top + containerRect.height / 2);
    const nextTop = Math.max(0, container.scrollTop + delta);

    isProgrammaticScrollRef.current = true;
    programmaticTargetTopRef.current = nextTop;
    container.scrollTo({
      top: nextTop,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setFocusedIndex(idx);
    if (smooth) {
      window.setTimeout(() => {
        isProgrammaticScrollRef.current = false;
        programmaticTargetTopRef.current = null;
      }, 260);
    } else {
      window.requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false;
        programmaticTargetTopRef.current = null;
      });
    }
  }, []);

  // Center initial card (or auto-focus Stop-Work Alert whenever tier transitions into Red)
  useEffect(() => {
    const target = isRedTier ? 3 : 2;
    setFocusedIndex(target);
    const raf = window.requestAnimationFrame(() => {
      centerCardAtIndex(target, false);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isRedTier, centerCardAtIndex]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (
      isProgrammaticScrollRef.current &&
      programmaticTargetTopRef.current !== null &&
      Math.abs(container.scrollTop - programmaticTargetTopRef.current) < 4
    ) {
      return;
    }
    if (isProgrammaticScrollRef.current) {
      isProgrammaticScrollRef.current = false;
      programmaticTargetTopRef.current = null;
    }

    const rect = container.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    let nearestIdx = focusedIndex;
    let minDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((el, idx) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cardCenterY = r.top + r.height / 2;
      const dist = Math.abs(cardCenterY - centerY);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIdx = idx;
      }
    });

    if (nearestIdx !== focusedIndex) {
      setFocusedIndex(nearestIdx);
    }
  };

  return (
    <div
      data-testid="app-carousel-screen"
      className="flex flex-col h-[370px] w-full bg-black text-white select-none font-[-apple-system,BlinkMacSystemFont,'SF_Pro_Display','Plus_Jakarta_Sans',sans-serif]"
    >
      {/* Top Watch Back / Header */}
      <div className="flex items-center justify-between px-4 pt-2 pb-1 shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to Heat Watch Gauge"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#212121] hover:bg-neutral-700 text-[11px] font-medium text-neutral-200 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Gauge</span>
        </button>
        <span className="text-[11px] font-semibold tracking-tight text-[#787aff]">
          SiteGuard Cards
        </span>
      </div>

      {/* Scroll-Snap Card Stack */}
      <div
        ref={scrollContainerRef}
        data-testid="app-carousel-scroll"
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto snap-y snap-mandatory px-3.5 space-y-2.5"
      >
        <div className="h-[88px] shrink-0" aria-hidden="true" />

        {cards.map((card, idx) => {
          const isFocused = focusedIndex === idx;
          const Icon = card.Icon;
          const borderAccent =
            isFocused && card.isStopWork && isRedTier
              ? 'border-[#fa114f]'
              : isFocused
                ? 'border-[#787aff]'
                : 'border-white/5';

          return (
            <button
              key={card.id}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              type="button"
              data-testid={`carousel-card-${card.id}`}
              data-focused={isFocused ? 'true' : 'false'}
              onClick={() => {
                if (!isFocused) {
                  centerCardAtIndex(idx, true);
                  return;
                }
                if (card.isForecast) {
                  onNavigateForecast();
                }
              }}
              className={`w-full text-left snap-center rounded-[22px] bg-[#212121] border px-4 py-3.5 transition-all duration-200 cursor-pointer ${borderAccent} ${
                isFocused ? 'opacity-100 scale-100 shadow-md' : 'opacity-40 scale-[0.94]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${card.badgeClass}`}
                >
                  <Icon className="w-4 h-4" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium tracking-wide uppercase text-neutral-400">
                    {card.label}
                  </div>
                  <div
                    className={`text-[15px] font-semibold leading-tight mt-0.5 truncate ${
                      card.valueClass ?? 'text-white'
                    }`}
                  >
                    {card.value}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5 truncate">
                    {card.sublabel}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        <div className="h-[88px] shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
