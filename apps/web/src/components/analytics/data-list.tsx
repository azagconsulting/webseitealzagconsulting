import type { TrackingPageStat } from "@/lib/types";

interface DataListProps {
  pages: TrackingPageStat[];
  onSelect: (page: TrackingPageStat) => void;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
  formatDuration: (value: number) => string;
  onReset?: () => void;
}

export function DataList({ pages, onSelect, formatNumber, formatPercent, formatDuration, onReset }: DataListProps) {
  if (!pages.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-400">Keine Seiten im Zeitraum gefunden.</p>
        {onReset && (
          <button
            type="button"
            className="min-h-[44px] rounded-full border border-white/10 bg-white/5 px-4 text-xs font-semibold text-slate-200 hover:bg-white/10"
            onClick={onReset}
          >
            Filter zurücksetzen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pages.map((page) => (
        <button
          key={page.path}
          type="button"
          onClick={() => onSelect(page)}
          className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-slate-200 transition hover:bg-white/10 active:bg-white/20"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-white">{page.path}</span>
            <span className="text-xs text-slate-400">{formatNumber(page.views)} Views</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span>CTR</span>
              <span className="font-semibold text-slate-100">{formatPercent(page.clickRate)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span>Klicks</span>
              <span className="font-semibold text-slate-100">{formatNumber(page.clicks)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span>Unique</span>
              <span className="font-semibold text-slate-100">{formatNumber(page.uniqueVisitors)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <span>Ø Zeit</span>
              <span className="font-semibold text-slate-100">{formatDuration(page.avgDurationMs)}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
