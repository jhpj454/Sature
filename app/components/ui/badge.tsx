import type { HTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

type BadgeVariant = "default" | "secondary" | "outline";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-zinc-900 text-white",
  secondary: "bg-zinc-100 text-zinc-700",
  outline: "border border-zinc-300 bg-white text-zinc-700",
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANT_STYLES[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
