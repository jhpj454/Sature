"use client";

import { useTheme } from "@/app/lib/theme-context";
import { cn } from "@/app/lib/cn";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-500 dark:text-slate-400 select-none">Light</span>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Toggle dark mode"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40",
          isDark
            ? "border-blue-500/40 bg-blue-600"
            : "border-white/50 bg-white/40 backdrop-blur-sm",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full shadow transition-transform duration-200",
            isDark
              ? "translate-x-5 bg-white"
              : "translate-x-1 bg-slate-600",
          )}
        />
      </button>
      <span className="text-sm text-slate-500 dark:text-slate-400 select-none">Dark</span>
    </div>
  );
}
