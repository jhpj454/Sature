import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-10 rounded-lg border border-white/50 bg-white/40 px-3 text-sm text-slate-800 shadow-sm outline-none backdrop-blur-sm transition-all duration-200 focus:border-blue-300/60 focus:bg-white/60 focus:ring-2 focus:ring-blue-200/40",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
