import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-10 rounded-md border border-white/60 bg-white/60 px-3 text-sm text-zinc-900 shadow-sm outline-none backdrop-blur-sm transition-colors focus:border-sky-300 focus:ring-2 focus:ring-sky-200/60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
