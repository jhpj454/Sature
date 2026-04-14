import type { InputHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-lg border border-white/50 bg-white/40 px-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none backdrop-blur-sm transition-all duration-200 focus:border-blue-300/60 focus:bg-white/60 focus:ring-2 focus:ring-blue-200/40",
        props.className,
      )}
    />
  );
}
