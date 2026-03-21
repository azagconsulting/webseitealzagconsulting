import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

interface InsightsAccordionProps {
  items: string[];
  maxVisible?: number;
}

function splitInsight(text: string) {
  const [head, ...rest] = text.split(":");
  if (rest.length === 0) return { head: null, body: text };
  return { head: head.trim(), body: rest.join(":").trim() };
}

export function InsightsAccordion({ items, maxVisible = 3 }: InsightsAccordionProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, maxVisible);

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">Noch keine Insights verfügbar.</p>;
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3 text-sm text-slate-200">
        {visibleItems.map((item) => {
          const { head, body } = splitInsight(item);
          return (
            <li
              key={item}
              className="flex min-w-0 items-start gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <ArrowUpRight className="mt-0.5 h-4 w-4 text-sky-300" />
              <span className="min-w-0 flex-1 break-words">
                {head ? (
                  <>
                    <span className="font-semibold text-slate-100">{head}:</span> {body}
                  </>
                ) : (
                  item
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {items.length > maxVisible && (
        <button
          type="button"
          className="min-h-[44px] w-full rounded-full border border-white/10 bg-white/5 px-4 text-xs font-semibold text-slate-200 hover:bg-white/10"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Weniger anzeigen" : "Alle anzeigen"}
        </button>
      )}
    </div>
  );
}
