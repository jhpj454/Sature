import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition-colors focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
