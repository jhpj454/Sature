import type { InputHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-800/60 px-3 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none backdrop-blur-sm transition-all duration-200 focus:border-blue-300/60 dark:focus:border-blue-500/50 focus:bg-white/60 dark:focus:bg-slate-800/80 focus:ring-2 focus:ring-blue-200/40 dark:focus:ring-blue-500/20",
        props.className,
      )}
    />
  );
}
