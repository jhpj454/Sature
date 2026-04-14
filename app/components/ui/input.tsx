import type { InputHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-white/60 bg-white/60 px-3 text-sm text-zinc-900 outline-none backdrop-blur-sm ring-sky-300 focus:ring focus:border-sky-300",
        props.className,
      )}
    />
  );
}
