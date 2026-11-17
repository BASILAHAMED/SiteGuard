import type { ForecastOutput, TelemetryHistoryPoint } from '../shared/types';

interface SparklineChartProps {
  history: TelemetryHistoryPoint[];
  forecast: ForecastOutput;
  dark?: boolean;
  height?: number;
}

export function SparklineChart({
  history,
  forecast,
  dark = false,
  height = 112,
}: SparklineChartProps) {
  const width = 360;
  const padL = 28;
  const padR = 14;
  const padT = 10;
  const padB = 20;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const recent = history.slice(-8);
  const lastMin = recent.length > 0 ? recent[recent.length - 1].minuteOffset : 0;
  const firstMin = recent.length > 0 ? recent[0].minuteOffset : 0;
  const spanHistory = Math.max(12, lastMin - firstMin);
  const maxMin = lastMin + 30;
  const minMin = lastMin - spanHistory;

  const toX = (m: number) => padL + ((m - minMin) / Math.max(1, maxMin - minMin)) * plotW;
  const toY = (score: number) => padT + plotH - (Math.max(0, Math.min(10, score)) / 10) * plotH;

  const histPath = recent
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.minuteOffset).toFixed(1)} ${toY(p.compositeScore).toFixed(1)}`)
    .join(' ');

  const canProject = forecast.status === 'ready' && forecast.psi15 && forecast.psi30 && recent.length > 0;
  const nowScore = recent.length > 0 ? recent[recent.length - 1].compositeScore : 0;

  let projPath = '';
  let ciPolygon = '';
  if (canProject && forecast.psi15 && forecast.psi30) {
    const x0 = toX(lastMin);
    const y0 = toY(nowScore);
    const x15 = toX(lastMin + 15);
    const y15 = toY(forecast.psi15.point);
    const x30 = toX(lastMin + 30);
    const y30 = toY(forecast.psi30.point);

    projPath = `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x15.toFixed(1)} ${y15.toFixed(1)} L ${x30.toFixed(1)} ${y30.toFixed(1)}`;
    ciPolygon = [
      `${x0.toFixed(1)},${y0.toFixed(1)}`,
      `${x15.toFixed(1)},${toY(forecast.psi15.high).toFixed(1)}`,
      `${x30.toFixed(1)},${toY(forecast.psi30.high).toFixed(1)}`,
      `${x30.toFixed(1)},${toY(forecast.psi30.low).toFixed(1)}`,
      `${x15.toFixed(1)},${toY(forecast.psi15.low).toFixed(1)}`,
    ].join(' ');
  }

  const labelColor = dark ? '#94a3b8' : '#64748b';
  const gridColor = dark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)';
  const lineColor = dark ? '#e2e8f0' : '#0f172a';

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Composite strain history and 30-minute forecast trajectory"
      >
        {/* Amber (4.0) and Red (7.0) threshold lines */}
        <line
          x1={padL}
          x2={width - padR}
          y1={toY(7.0)}
          y2={toY(7.0)}
          stroke="#dc2626"
          strokeOpacity={dark ? 0.55 : 0.4}
          strokeDasharray="3 3"
          strokeWidth={1}
        />
        <line
          x1={padL}
          x2={width - padR}
          y1={toY(4.0)}
          y2={toY(4.0)}
          stroke="#d97706"
          strokeOpacity={dark ? 0.55 : 0.45}
          strokeDasharray="3 3"
          strokeWidth={1}
        />

        {/* Vertical divider at t=0 (now) */}
        <line
          x1={toX(lastMin)}
          x2={toX(lastMin)}
          y1={padT}
          y2={height - padB}
          stroke={gridColor}
          strokeWidth={1}
        />

        {/* Y-axis labels */}
        <text x={4} y={toY(7.0) + 3} fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#dc2626">
          7.0
        </text>
        <text x={4} y={toY(4.0) + 3} fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#d97706">
          4.0
        </text>

        {/* 90% CI band */}
        {canProject && (
          <polygon
            points={ciPolygon}
            fill={forecast.predictedTier30 === 'Red' ? '#dc2626' : '#f59e0b'}
            fillOpacity={dark ? 0.2 : 0.16}
          />
        )}

        {/* Historical line */}
        {recent.length > 1 && (
          <path
            d={histPath}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Projected trajectory */}
        {canProject && (
          <>
            <path
              d={projPath}
              fill="none"
              stroke={
                forecast.predictedTier15 === 'Red' || forecast.predictedTier30 === 'Red'
                  ? '#ef4444'
                  : forecast.predictedTier15 === 'Amber' || forecast.predictedTier30 === 'Amber'
                    ? '#f59e0b'
                    : '#10b981'
              }
              strokeWidth={2}
              strokeDasharray="4 3"
            />
            <circle
              cx={toX(lastMin + 15)}
              cy={toY(forecast.psi15!.point)}
              r={3}
              fill={dark ? '#0f172a' : '#ffffff'}
              stroke="#f59e0b"
              strokeWidth={2}
            />
            <circle
              cx={toX(lastMin + 30)}
              cy={toY(forecast.psi30!.point)}
              r={3}
              fill={dark ? '#0f172a' : '#ffffff'}
              stroke="#f59e0b"
              strokeWidth={2}
            />
          </>
        )}

        {/* Current point */}
        {recent.length > 0 && (
          <circle cx={toX(lastMin)} cy={toY(nowScore)} r={3.5} fill={lineColor} />
        )}

        {/* X-axis ticks */}
        <text
          x={toX(lastMin)}
          y={height - 4}
          textAnchor="middle"
          fontSize="9"
          fontFamily="JetBrains Mono, monospace"
          fill={labelColor}
        >
          Now
        </text>
        <text
          x={toX(lastMin + 15)}
          y={height - 4}
          textAnchor="middle"
          fontSize="9"
          fontFamily="JetBrains Mono, monospace"
          fill={labelColor}
        >
          +15m
        </text>
        <text
          x={toX(lastMin + 30)}
          y={height - 4}
          textAnchor="end"
          fontSize="9"
          fontFamily="JetBrains Mono, monospace"
          fill={labelColor}
        >
          +30m
        </text>
      </svg>
    </div>
  );
}
