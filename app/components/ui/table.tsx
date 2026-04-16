import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

export function TableContainer({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-x-auto rounded-2xl border border-white/50 dark:border-white/[0.06] bg-white/45 dark:bg-[#252528] backdrop-blur-xl dark:backdrop-blur-none", className)}
      style={style}
      {...props}
    />
  );
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("min-w-full text-sm", className)} {...props} />;
}
