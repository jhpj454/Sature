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
  default: "bg-slate-800 text-white hover:bg-slate-700 shadow-sm",
  secondary: "bg-white/50 text-slate-700 hover:bg-white/70 border border-white/50 backdrop-blur-sm shadow-sm",
  outline: "border border-white/50 bg-white/30 text-slate-700 hover:bg-white/50 backdrop-blur-sm",
  ghost: "bg-transparent text-slate-500 hover:bg-white/30 hover:text-slate-700",
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
