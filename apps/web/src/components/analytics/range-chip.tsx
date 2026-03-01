import { clsx } from "clsx";

type RangeChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

export function RangeChip({ label, active, onClick }: RangeChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "min-h-[44px] rounded-lg px-3 py-2 text-xs font-semibold",
        active ? "bg-white/20 text-white" : "text-slate-300 hover:bg-white/10",
      )}
    >
      {label}
    </button>
  );
}
