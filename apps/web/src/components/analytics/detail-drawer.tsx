import { X } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface DetailDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}

export function DetailDrawer({ open, title, subtitle, children, onClose }: DetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const bodyStyle = document.body.style;
    const previousOverflow = bodyStyle.overflow;
    bodyStyle.overflow = "hidden";
    return () => {
      bodyStyle.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-white/10 backdrop-blur"
        onClick={onClose}
        aria-label="Details schließen"
      />
      <div className="absolute inset-x-0 bottom-0 w-full max-w-full max-h-none overflow-hidden overflow-x-hidden rounded-t-3xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.35)] md:inset-y-0 md:left-auto md:right-0 md:overflow-y-auto md:max-h-none md:w-[420px] md:rounded-l-3xl md:rounded-tr-none">
        <div className="sticky top-0 z-10 mb-5 border-b border-white/10 bg-white/5 pb-4 backdrop-blur">
          <div className="relative flex items-start gap-3 pr-12">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Details</p>
              <h2 className="truncate text-lg font-semibold text-white">{title}</h2>
              {subtitle && <p className="truncate text-sm text-slate-400">{subtitle}</p>}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-11 w-11"
              onClick={onClose}
              aria-label="Schließen"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}
