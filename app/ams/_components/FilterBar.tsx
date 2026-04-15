import type { ReactNode } from "react";
import Link from "next/link";

type FilterBarProps = {
  children: ReactNode;
  resetHref?: string;
  submitLabel?: string;
};

export function FilterBar({ children, resetHref, submitLabel = "Apply" }: FilterBarProps) {
  return (
    <form
      className="grid gap-3 rounded-2xl border border-white/50 dark:border-0 bg-white/45 dark:bg-[rgba(255,255,255,0.10)] p-4 backdrop-blur-xl md:grid-cols-5 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.40)]"
    >
      {children}
      <div className="flex items-end gap-2">
        <button
          className="rounded-lg bg-slate-800 dark:bg-[#4a7fc1] px-3 py-2 text-[13px] font-medium text-white shadow-sm transition-all duration-200 hover:bg-slate-700 dark:hover:bg-[#5a8fcf]"
          type="submit"
        >
          {submitLabel}
        </button>
        {resetHref ? (
          <Link
            className="rounded-lg border border-white/50 dark:border-white/[0.14] bg-white/30 dark:bg-white/[0.08] px-3 py-2 text-[13px] text-slate-500 dark:text-[#9da5b4] transition-all duration-200 hover:bg-white/50 dark:hover:bg-white/[0.12] hover:text-slate-700 dark:hover:text-[#e8eaf0]"
            href={resetHref}
          >
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}
