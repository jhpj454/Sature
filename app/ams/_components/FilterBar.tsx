import type { ReactNode } from "react";
import Link from "next/link";

type FilterBarProps = {
  children: ReactNode;
  resetHref?: string;
  submitLabel?: string;
};

export function FilterBar({ children, resetHref, submitLabel = "Apply" }: FilterBarProps) {
  return (
    <form className="grid gap-3 rounded-xl border border-white/60 bg-white/75 p-4 shadow-sm backdrop-blur-sm md:grid-cols-5">
      {children}
      <div className="flex items-end gap-2">
        <button
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          type="submit"
        >
          {submitLabel}
        </button>
        {resetHref ? (
          <Link
            className="rounded-lg border border-white/60 bg-white/50 px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-white/80"
            href={resetHref}
          >
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}
