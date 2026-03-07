import type { InputHTMLAttributes } from "react";
import { cn } from "@/app/lib/cn";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-300 focus:ring",
        props.className,
      )}
    />
  );
}
