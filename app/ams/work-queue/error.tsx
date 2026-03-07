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
    <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">Couldn’t load work queue.</h2>
        <p className="text-sm text-zinc-600">
          An unexpected rendering error occurred. The shell is still available.
        </p>
      </div>
      <button
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900"
        onClick={() => reset()}
        type="button"
      >
        Retry
      </button>
    </div>
  );
}
