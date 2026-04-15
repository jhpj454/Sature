import type { InputHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-white/50 dark:border-white/[0.15] bg-white/40 dark:bg-[rgba(255,255,255,0.05)] px-3 text-sm text-slate-800 dark:text-[#e8eaf0] placeholder:text-slate-400 dark:placeholder:text-[#4e5464] outline-none backdrop-blur-sm transition-all duration-200 focus:border-blue-300/60 dark:focus:border-[#4a7fc1] focus:bg-white/60 dark:focus:bg-[rgba(255,255,255,0.08)] focus:ring-2 focus:ring-blue-200/40 dark:focus:ring-blue-500/20",
        props.className,
      )}
    />
  );
}
