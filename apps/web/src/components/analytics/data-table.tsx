import { ArrowUpRight } from "lucide-react";

import type { TrackingPageStat } from "@/lib/types";

interface DataTableProps {
  pages: TrackingPageStat[];
  onSelect: (page: TrackingPageStat) => void;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
  formatDuration: (value: number) => string;
  onReset?: () => void;
}

export function DataTable({ pages, onSelect, formatNumber, formatPercent, formatDuration, onReset }: DataTableProps) {
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
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <div className="max-h-[520px] overflow-auto">
        <div className="min-w-[760px]">
          <div className="sticky top-0 z-10 grid grid-cols-[1.3fr_repeat(5,minmax(0,1fr))_120px] gap-3 border-b border-white/10 bg-white/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
            <span>Pfad</span>
            <span className="text-right">Views</span>
            <span className="text-right">Unique</span>
            <span className="text-right">CTR</span>
            <span className="text-right">Ø Zeit</span>
            <span className="text-right">Klicks</span>
            <span className="text-right">Aktion</span>
          </div>
          <div className="divide-y divide-white/5">
            {pages.map((page) => (
              <div
                key={page.path}
                className="grid cursor-pointer grid-cols-[1.3fr_repeat(5,minmax(0,1fr))_120px] items-center gap-3 px-4 py-3 text-sm text-slate-200 hover:bg-white/5"
                onClick={() => onSelect(page)}
              >
                <div className="truncate text-white">{page.path}</div>
                <div className="text-right font-semibold">{formatNumber(page.views)}</div>
                <div className="text-right text-slate-300">{formatNumber(page.uniqueVisitors)}</div>
                <div className="text-right text-slate-300">{formatPercent(page.clickRate)}</div>
                <div className="text-right text-slate-300">{formatDuration(page.avgDurationMs)}</div>
                <div className="text-right text-slate-300">{formatNumber(page.clicks)}</div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="flex min-h-[44px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-xs text-slate-200 hover:bg-white/10"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(page);
                    }}
                  >
                    Details
                    <ArrowUpRight className="h-4 w-4 text-sky-300" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
