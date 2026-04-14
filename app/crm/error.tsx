"use client";

import { useEffect } from "react";

export default function CrmError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CRM route crashed", error);
  }, [error]);

  return (
    <div className="space-y-4 rounded-lg border border-slate-200/30 bg-white p-6">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-slate-800">Couldn’t load this CRM page.</h1>
        <p className="text-sm text-slate-500">
          The producer shell is still active. Retry the route to continue.
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
