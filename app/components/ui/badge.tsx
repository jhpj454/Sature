import type { HTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

type BadgeVariant = "default" | "secondary" | "outline";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-slate-800 dark:bg-[rgba(74,127,193,0.20)] text-white dark:text-[#a8c4e8]",
  secondary: "bg-white/50 dark:bg-white/[0.08] text-slate-600 dark:text-[#9da5b4] backdrop-blur-sm",
  outline: "border border-white/50 dark:border-white/[0.15] bg-white/30 dark:bg-white/5 text-slate-600 dark:text-[#9da5b4] backdrop-blur-sm",
};

export function Badge({
  className,
  children,
  variant = "secondary",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
