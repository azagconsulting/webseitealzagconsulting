import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RangeChip } from "@/components/analytics/range-chip";

type RangeKey = "7" | "30" | "90" | "custom";

interface FilterBottomSheetProps {
  open: boolean;
  onClose: () => void;
  rangeKey: RangeKey;
  onSelectRange: (key: RangeKey) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  pathQuery: string;
  onPathChange: (value: string) => void;
  onApply: () => void;
  onReset: () => void;
}

export function FilterBottomSheet({
  open,
  onClose,
  rangeKey,
  onSelectRange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  pathQuery,
  onPathChange,
  onApply,
  onReset,
}: FilterBottomSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-white/10 backdrop-blur"
        onClick={onClose}
        aria-label="Filter schließen"
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Filter</p>
            <h2 className="text-lg font-semibold text-white">Zeitraum & Segmentierung</h2>
            <p className="text-sm text-slate-400">Passe Datum, Pfad und Kanal an.</p>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={onClose} aria-label="Schließen">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Zeitraum</p>
            <div className="mt-2 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/10 p-2">
              <RangeChip label="7T" active={rangeKey === "7"} onClick={() => onSelectRange("7")} />
              <RangeChip label="30T" active={rangeKey === "30"} onClick={() => onSelectRange("30")} />
              <RangeChip label="90T" active={rangeKey === "90"} onClick={() => onSelectRange("90")} />
              <RangeChip label="Custom" active={rangeKey === "custom"} onClick={() => onSelectRange("custom")} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>

          <label className="flex flex-col gap-1 text-xs text-slate-300">
            Pfad
            <Input
              value={pathQuery}
              onChange={(e) => onPathChange(e.target.value)}
              placeholder="/angebote oder /services"
              className="h-11 rounded-full"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-300">
            Channel
            <select
              className="h-11 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-slate-300"
              disabled
            >
              <option>Alle</option>
            </select>
            {/* TODO: Channel-Daten aus Tracking API ergänzen, sobald verfügbar. */}
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            variant="secondary"
            className="h-11 flex-1"
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            Zurücksetzen
          </Button>
          <Button
            className="h-11 flex-1"
            onClick={() => {
              onApply();
              onClose();
            }}
          >
            Anwenden
          </Button>
        </div>
      </div>
    </div>
  );
}
