import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

export function TableContainer({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-x-auto rounded-2xl border border-white/50 dark:border-white/10 bg-white/45 dark:bg-slate-800/60 backdrop-blur-xl", className)}
      style={{
        boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)",
        ...style,
      }}
      {...props}
    />
  );
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("min-w-full text-sm", className)} {...props} />;
}
