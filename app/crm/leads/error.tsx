"use client";

import { Button } from "@/app/components/ui/button";

export default function CrmLeadsError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <h2 className="text-base font-semibold text-zinc-900">Couldn’t open Leads.</h2>
      <p className="text-sm text-zinc-700">{error.message || "Unexpected CRM error."}</p>
      <Button size="sm" variant="outline" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
