import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/app/lib/cn";

type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  default: "bg-slate-800 dark:bg-[#4a7fc1] text-white hover:bg-slate-700 dark:hover:bg-[#5a8fcf] shadow-sm",
  secondary: "bg-white/50 dark:bg-white/[0.08] text-slate-700 dark:text-[#c8cdd8] hover:bg-white/70 dark:hover:bg-white/[0.13] border border-white/50 dark:border-white/[0.14] backdrop-blur-sm shadow-sm",
  outline: "border border-white/50 dark:border-white/[0.14] bg-white/30 dark:bg-white/[0.08] text-slate-700 dark:text-[#c8cdd8] hover:bg-white/50 dark:hover:bg-white/[0.13] backdrop-blur-sm",
  ghost: "bg-transparent text-slate-500 dark:text-[#7b8494] hover:bg-white/30 dark:hover:bg-white/[0.07] hover:text-slate-700 dark:hover:text-[#c8cdd8]",
  destructive: "bg-rose-500 text-white hover:bg-rose-400 shadow-sm",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};

export function Button({
  className,
  variant = "default",
  size = "md",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        className,
      )}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
