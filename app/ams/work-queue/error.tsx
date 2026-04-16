"use client";

import { useEffect } from "react";

export default function WorkQueueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Work queue page crashed", error);
  }, [error]);

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/30 bg-white p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-800">Couldn’t load work queue.</h2>
        <p className="text-sm text-slate-500">
          An unexpected rendering error occurred. The shell is still available.
        </p>
      </div>
      <button
        className="rounded-md border border-slate-300/40 px-4 py-2 text-sm font-medium text-slate-800"
        onClick={() => reset()}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}
