import { clsx } from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
};

const baseStyles =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-60";

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-sky-400/90 text-slate-950 hover:bg-sky-300/90 active:bg-sky-200/90 shadow-[0_10px_40px_rgba(56,189,248,0.35)]",
  secondary:
    "bg-white/10 text-white hover:bg-white/20 active:bg-white/30 border border-white/20",
  ghost:
    "bg-transparent text-white hover:bg-white/10 active:bg-white/15 border border-white/10",
  outline:
    "bg-transparent text-white border border-white/20 hover:bg-white/10 active:bg-white/15",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
  icon: "h-10 w-10 p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", size = "md", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    );
  },
);
