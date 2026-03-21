import { Search } from "lucide-react";
import { clsx } from "clsx";

import { Input } from "@/components/ui/input";
import { RangeChip } from "@/components/analytics/range-chip";

type RangeKey = "7" | "30" | "90" | "custom";

interface FilterBarProps {
  rangeKey: RangeKey;
  onSelectRange: (rangeKey: RangeKey) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onApplyCustom: () => void;
  pathQuery: string;
  onPathChange: (value: string) => void;
  className?: string;
}

export function FilterBar({
  rangeKey,
  onSelectRange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onApplyCustom,
  pathQuery,
  onPathChange,
  className,
}: FilterBarProps) {
  return (
    <div className={clsx("mt-4 rounded-2xl border border-white/10 bg-white/5 p-4", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-2">
            <RangeChip label="7T" active={rangeKey === "7"} onClick={() => onSelectRange("7")} />
            <RangeChip label="30T" active={rangeKey === "30"} onClick={() => onSelectRange("30")} />
            <RangeChip label="90T" active={rangeKey === "90"} onClick={() => onSelectRange("90")} />
            <RangeChip label="Custom" active={rangeKey === "custom"} onClick={() => onSelectRange("custom")} />
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-300">
            Von
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="h-11 rounded-full bg-slate-900/60"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-300">
            Bis
            <Input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="h-11 rounded-full bg-slate-900/60"
            />
          </label>
          <button
            type="button"
            onClick={onApplyCustom}
            className="min-h-[44px] rounded-full border border-white/10 bg-white/10 px-4 text-xs font-semibold text-white hover:bg-white/20"
          >
            Anwenden
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
          <Search className="h-4 w-4" />
          <input
            className="h-7 w-48 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            placeholder="Pfad filtern (z. B. /pricing)"
            value={pathQuery}
            onChange={(e) => onPathChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
