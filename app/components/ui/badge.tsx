import type { HTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

type BadgeVariant = "default" | "secondary" | "outline";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-slate-800 text-white",
  secondary: "bg-white/50 text-slate-600 backdrop-blur-sm",
  outline: "border border-white/50 bg-white/30 text-slate-600 backdrop-blur-sm",
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
