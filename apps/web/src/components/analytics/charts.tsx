import type { TrackingTimeseriesPoint } from "@/lib/types";

interface StockLineChartProps {
  data: TrackingTimeseriesPoint[];
  formatNumber: (value: number) => string;
  formatDate: (value: string) => string;
}

export function StockLineChart({ data, formatNumber, formatDate }: StockLineChartProps) {
  if (!data.length) {
    return <p className="text-sm text-slate-400">Keine Daten für den Zeitraum.</p>;
  }

  const width = 640;
  const height = 220;
  const margin = { top: 12, right: 12, bottom: 32, left: 44 };
  const maxValue = Math.max(...data.map((point) => Math.max(point.views, point.organic, point.direct)), 1);
  const tickCount = 4;
  const rawStep = maxValue / tickCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = Math.max(1, Math.ceil(rawStep / magnitude) * magnitude);
  const scaledMax = niceStep * tickCount;
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;
  const step = data.length > 1 ? chartWidth / (data.length - 1) : 0;

  const points = data.map((point, index) => {
    const x = margin.left + index * step;
    const yViews = margin.top + chartHeight - (point.views / scaledMax) * chartHeight;
    const yOrganic = margin.top + chartHeight - (point.organic / scaledMax) * chartHeight;
    return { x, yViews, yOrganic, value: point.views, label: point.date };
  });

  const axisY = margin.top + chartHeight;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, index) => {
    const value = index * niceStep;
    const y = margin.top + chartHeight - (value / scaledMax) * chartHeight;
    return { value, y };
  });

  const labelCount = Math.min(5, data.length);
  const labelStep = labelCount > 1 ? Math.round((data.length - 1) / (labelCount - 1)) : 1;
  const labelIndices = Array.from(
    new Set(Array.from({ length: labelCount }, (_, index) => Math.min(data.length - 1, index * labelStep))),
  ).sort((a, b) => a - b);

  const viewPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.yViews.toFixed(1)}`).join(" ");
  const organicPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.yOrganic.toFixed(1)}`).join(" ");

  const areaPath = [
    `M ${points[0].x.toFixed(1)} ${axisY}`,
    ...points.map((point) => `L ${point.x.toFixed(1)} ${point.yViews.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${axisY}`,
    "Z",
  ].join(" ");

  const lastPoint = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Traffic Verlauf"
      className="h-44 w-full max-w-full sm:h-52"
    >
      <defs>
        <linearGradient id="trafficArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(14,165,233,0.35)" />
          <stop offset="100%" stopColor="rgba(14,165,233,0.02)" />
        </linearGradient>
      </defs>
      {yTicks.map((tick) => (
        <g key={`y-${tick.value}`}>
          <line
            x1={margin.left}
            y1={tick.y}
            x2={width - margin.right}
            y2={tick.y}
            stroke="rgba(148,163,184,0.18)"
            strokeDasharray="4 6"
          />
          <text
            x={margin.left - 8}
            y={tick.y}
            fill="rgba(148,163,184,0.7)"
            fontSize="10"
            textAnchor="end"
            dominantBaseline="middle"
          >
            {formatNumber(tick.value)}
          </text>
        </g>
      ))}
      <line x1={margin.left} y1={axisY} x2={width - margin.right} y2={axisY} stroke="rgba(148,163,184,0.35)" />
      <path d={areaPath} fill="url(#trafficArea)" />
      <path d={viewPath} fill="none" stroke="rgba(56,189,248,0.8)" strokeWidth={2.5} strokeLinecap="round" />
      <path
        d={organicPath}
        fill="none"
        stroke="rgba(52,211,153,0.9)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="6 4"
      />
      <circle cx={lastPoint.x} cy={lastPoint.yViews} r={4} fill="#0ea5e9" stroke="white" strokeWidth={2} />
      {labelIndices.map((index) => {
        const point = points[index];
        return (
          <g key={`x-${point.label}-${index}`}>
            <line x1={point.x} y1={axisY} x2={point.x} y2={axisY + 4} stroke="rgba(148,163,184,0.45)" />
            <text x={point.x} y={axisY + 18} fill="rgba(148,163,184,0.7)" fontSize="10" textAnchor="middle">
              {formatDate(point.label)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface TrendLineProps {
  label: string;
  change: { value: number; pct: number };
}

export function TrendLine({ label, change }: TrendLineProps) {
  const isUp = change.value > 0;
  const deltaLabel = Math.abs(change.value).toLocaleString("de-DE");
  const pctLabel = `${Math.round(change.pct * 1000) / 10}%`;
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <p className="text-sm text-slate-200">
          {isUp ? "▲" : change.value < 0 ? "▼" : "—"} {deltaLabel} ({pctLabel})
        </p>
      </div>
    </div>
  );
}

interface SourceSplitProps {
  organic: number;
  direct: number;
  total: number;
  formatNumber: (value: number) => string;
}

export function SourceSplit({ organic, direct, total, formatNumber }: SourceSplitProps) {
  const safeTotal = Math.max(total, organic + direct, 0);
  const baseTotal = safeTotal || 0;
  const organicPercent = baseTotal ? Math.min(100, Math.max(0, (organic / baseTotal) * 100)) : 0;
  const directPercent = baseTotal ? Math.min(100, Math.max(0, (direct / baseTotal) * 100)) : 0;
  const otherCount = Math.max(0, baseTotal - organic - direct);
  const otherPercent = baseTotal ? Math.max(0, 100 - organicPercent - directPercent) : 0;

  return (
    <div>
      <div className="mt-2 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
        <div className="flex h-full">
          <span style={{ width: `${organicPercent}%` }} className="h-full bg-emerald-500/70" />
          <span style={{ width: `${directPercent}%` }} className="h-full bg-sky-500/70" />
          <span style={{ width: `${otherPercent}%` }} className="h-full bg-slate-500/50" />
        </div>
      </div>
      <div className="mt-3 space-y-2 text-xs text-slate-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Organisch</span>
          </div>
          <span>{formatNumber(organic)} Aufrufe</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span>Direkt</span>
          </div>
          <span>{formatNumber(direct)} Aufrufe</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span>Referrals/sonstiges</span>
          </div>
          <span>{formatNumber(otherCount)} Aufrufe</span>
        </div>
      </div>
    </div>
  );
}
