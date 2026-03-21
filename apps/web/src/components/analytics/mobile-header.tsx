import { clsx } from "clsx";
import type { ReactNode } from "react";

interface MobileHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  chips?: string[];
  children?: ReactNode;
  className?: string;
}

export function MobileHeader({
  eyebrow,
  title,
  description,
  actions,
  chips,
  children,
  className,
}: MobileHeaderProps) {
  return (
    <div className={clsx("z-30", className)}>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            {eyebrow && (
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{eyebrow}</p>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
            {description && <p className="text-sm text-slate-400">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {chips && chips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="max-w-[220px] truncate rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs text-slate-200"
                title={chip}
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
