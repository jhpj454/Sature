"use client";

import { useState, useTransition } from "react";
import { cn } from "@/app/lib/cn";

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Logout failed.");
        }

        window.location.href = "/login";
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Logout failed.");
      }
    });
  }

  return (
    <div className="space-y-1">
      <button
        className={cn(
          "rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100",
          className,
        )}
        disabled={isPending}
        onClick={onClick}
        type="button"
      >
        {isPending ? "Signing out..." : "Logout"}
      </button>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
