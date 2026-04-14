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
      className="grid gap-3 rounded-2xl border border-white/50 bg-white/45 p-4 backdrop-blur-xl md:grid-cols-5"
      style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
    >
      {children}
      <div className="flex items-end gap-2">
        <button
          className="rounded-lg bg-slate-800 px-3 py-2 text-[13px] font-medium text-white shadow-sm transition-all duration-200 hover:bg-slate-700"
          type="submit"
        >
          {submitLabel}
        </button>
        {resetHref ? (
          <Link
            className="rounded-lg border border-white/50 bg-white/30 px-3 py-2 text-[13px] text-slate-500 transition-all duration-200 hover:bg-white/50 hover:text-slate-700"
            href={resetHref}
          >
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}
