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
  default: "bg-zinc-800 text-white hover:bg-zinc-700",
  secondary: "bg-white/60 text-zinc-900 hover:bg-white/80 border border-white/60 backdrop-blur-sm",
  outline: "border border-white/60 bg-white/50 text-zinc-900 hover:bg-white/70 backdrop-blur-sm",
  ghost: "bg-transparent text-zinc-700 hover:bg-white/50",
  destructive: "bg-rose-600 text-white hover:bg-rose-500",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
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
        "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
