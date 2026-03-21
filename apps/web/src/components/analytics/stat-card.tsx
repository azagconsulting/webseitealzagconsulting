import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

interface StatTrend {
  direction: "up" | "down" | "flat";
  label: string;
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  trend?: StatTrend;
  onClick?: () => void;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, hint, trend, onClick, className }: StatCardProps) {
  const Tag = onClick ? "button" : "div";
  const trendColor =
    trend?.direction === "up"
      ? "text-emerald-200"
      : trend?.direction === "down"
        ? "text-rose-300"
        : "text-slate-300";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={clsx(
        "flex min-h-[160px] flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left shadow-[0_10px_40px_rgba(8,47,73,0.35)] transition hover:bg-white/10 active:bg-white/20",
        onClick && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white tabular-nums sm:text-4xl">{value}</p>
          {hint && <p className="text-xs text-slate-400">{hint}</p>}
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-200">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="text-xs text-slate-300">
        {trend ? (
          <span className={clsx("flex items-center gap-2 font-semibold", trendColor)}>
            <span>{trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "—"}</span>
            <span>{trend.label}</span>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>
    </Tag>
  );
}
