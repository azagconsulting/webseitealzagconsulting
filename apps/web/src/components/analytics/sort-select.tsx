import { clsx } from "clsx";

type SortKey = "views" | "ctr" | "duration" | "clicks" | "unique";

interface SortSelectProps {
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onChange: (key: SortKey) => void;
  onToggleDir: () => void;
  className?: string;
}

export function SortSelect({ sortKey, sortDir, onChange, onToggleDir, className }: SortSelectProps) {
  return (
    <div className={clsx("flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1", className)}>
      <select
        className="h-11 bg-transparent text-xs text-white outline-none"
        value={sortKey}
        onChange={(e) => onChange(e.target.value as SortKey)}
      >
        <option value="views">Views</option>
        <option value="unique">Unique</option>
        <option value="ctr">CTR</option>
        <option value="duration">Verweildauer</option>
        <option value="clicks">Klicks</option>
      </select>
      <button
        type="button"
        onClick={onToggleDir}
        className="min-h-[44px] rounded-full border border-white/10 bg-white/10 px-3 text-[11px] text-slate-200"
      >
        {sortDir === "desc" ? "↓" : "↑"}
      </button>
    </div>
  );
}
