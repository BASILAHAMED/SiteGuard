import type { WorkerStateSelf } from '../shared/types';

interface AppCarouselProps {
  workerState: WorkerStateSelf;
  onClose: () => void;
}

/**
 * Card-carousel "App Open" screen — vertical stack of cards with the
 * center/focused card at full opacity and the rest dimmed, matching the
 * design-reference's card pattern (card bg #212121, accent #787aff,
 * negative/alert accent #fa114f, ~22px card radius). Driven entirely by
 * live workerState — no placeholder data.
 */
export function AppCarousel({ workerState, onClose }: AppCarouselProps) {
  const { assessment, context } = workerState;
  const isRed = assessment.tier === 'Red';

  const cards: Array<{
    key: string;
    title: string;
    value: string | null;
    focus: boolean;
    negative?: boolean;
    icon?: boolean;
  }> = [
    {
      key: 'strain',
      title: 'Composite Strain',
      value: `${assessment.compositeScore.toFixed(1)} / 10`,
      focus: false,
    },
    {
      key: 'break',
      title: 'Next Break',
      value: context.plannedBreakTime,
      focus: false,
    },
    {
      key: 'forecast',
      title: 'Heat Risk Forecast',
      value: null,
      focus: true,
      icon: true,
    },
    {
      key: 'alert',
      title: 'Stop-Work Alert',
      value: isRed ? 'STOP WORK NOW' : 'None active',
      focus: isRed,
      negative: true,
    },
    {
      key: 'hydration',
      title: 'Hydration',
      value: `${context.hydrationCount} cups today`,
      focus: false,
    },
  ];

  return (
    <div
      data-testid="app-carousel"
      className="flex flex-col p-4 min-h-[300px]"
      style={{
        background: '#0c0d10',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Plus Jakarta Sans", sans-serif',
      }}
    >
      <div className="flex items-center justify-between text-[13px] font-bold mb-3">
        <span style={{ color: '#787aff', fontWeight: 800, letterSpacing: '0.2px' }}>SiteGuard</span>
        <span className="text-white/70 font-medium" style={{ letterSpacing: '0.7px' }}>
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 items-center">
        {cards.map((c) => (
          <div
            key={c.key}
            data-testid={`carousel-card-${c.key}`}
            data-focus={c.focus ? 'true' : 'false'}
            className="w-[220px] transition-all duration-200"
            style={{
              background: '#212121',
              borderRadius: 21.7,
              padding: c.focus ? '20px 16px' : '14px 16px',
              opacity: c.focus ? 1 : 0.4,
              transform: c.focus ? 'scale(1)' : 'scale(0.94)',
              textAlign: c.focus ? 'center' : 'left',
            }}
          >
            {c.icon && (
              <div
                className="mx-auto mb-2.5 flex items-center justify-center rounded-full text-lg"
                style={{ width: 46, height: 46, background: '#787aff' }}
              >
                🛡
              </div>
            )}
            <div
              className="text-[14px]"
              style={{
                color: c.focus ? '#787aff' : '#fff',
                fontWeight: c.focus ? 700 : 500,
                letterSpacing: '0.7px',
              }}
            >
              {c.title}
            </div>
            {c.value && (
              <div
                className="mt-2 text-[13px]"
                style={{
                  color: c.negative && isRed ? '#fa114f' : '#fff',
                  fontWeight: 500,
                  letterSpacing: '0.65px',
                }}
              >
                {c.value}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-right mt-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          data-testid="carousel-done"
          className="text-[10px] font-mono text-slate-400 hover:text-white cursor-pointer"
        >
          done
        </button>
      </div>
    </div>
  );
}
