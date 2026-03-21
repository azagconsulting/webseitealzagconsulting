import type { ReactNode } from "react";
import { clsx } from "clsx";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, action, children, footer, className }: ChartCardProps) {
  return (
    <div
      className={clsx("min-w-0 rounded-3xl border p-5 backdrop-blur md:p-6", className)}
      style={{
        backgroundColor: "var(--panel-bg)",
        borderColor: "var(--panel-border)",
        boxShadow: "var(--panel-shadow)",
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-white sm:text-lg">{title}</h3>
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
        {action && <div className="text-sm text-slate-300">{action}</div>}
      </div>
      <div className="mt-4 space-y-4">
        {children}
        {footer}
      </div>
    </div>
  );
}
