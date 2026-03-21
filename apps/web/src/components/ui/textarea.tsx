import { clsx } from "clsx";
import type { TextareaHTMLAttributes } from "react";
import { forwardRef } from "react";

const baseStyles =
  "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 4, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={clsx(
        baseStyles,
        "resize-none",
        invalid && "border-rose-400/60 text-rose-100",
        className,
      )}
      {...props}
    />
  );
});
