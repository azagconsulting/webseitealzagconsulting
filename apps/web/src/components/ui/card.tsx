import { clsx } from "clsx";
import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, description, action, children, className }: CardProps) {
  return (
    <div
      className={clsx("rounded-3xl border p-6 backdrop-blur", className)}
      style={{
        backgroundColor: "var(--panel-bg)",
        borderColor: "var(--panel-border)",
        boxShadow: "var(--panel-shadow)",
      }}
    >
      {(title || description || action) && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>}
            {description && <p className="text-sm text-[var(--text-secondary)]">{description}</p>}
          </div>
          {action && <div className="text-sm text-[var(--text-secondary)]">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
