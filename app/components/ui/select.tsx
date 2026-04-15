import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-10 rounded-lg border border-white/50 dark:border-white/[0.15] bg-white/40 dark:bg-[rgba(255,255,255,0.05)] px-3 text-sm text-slate-800 dark:text-[#e8eaf0] shadow-sm outline-none backdrop-blur-sm transition-all duration-200 focus:border-blue-300/60 dark:focus:border-[#4a7fc1] focus:bg-white/60 dark:focus:bg-[rgba(255,255,255,0.08)] focus:ring-2 focus:ring-blue-200/40 dark:focus:ring-blue-500/20",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
