import type { ReactNode } from "react";
import Link from "next/link";

type FilterBarProps = {
  children: ReactNode;
  resetHref?: string;
  submitLabel?: string;
};

export function FilterBar({ children, resetHref, submitLabel = "Apply" }: FilterBarProps) {
  return (
    <form className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-5">
      {children}
      <div className="flex items-end gap-2">
        <button
          className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
          type="submit"
        >
          {submitLabel}
        </button>
        {resetHref ? (
          <Link className="rounded border border-zinc-300 px-3 py-2 text-sm" href={resetHref}>
            Reset
          </Link>
        ) : null}
      </div>
    </form>
  );
}
