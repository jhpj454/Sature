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
          "rounded-lg border border-white/50 dark:border-white/[0.14] bg-white/30 dark:bg-white/[0.08] px-3 py-1.5 text-[13px] font-medium text-slate-500 dark:text-[#9da5b4] backdrop-blur-sm transition-all duration-200 hover:bg-white/50 dark:hover:bg-white/[0.12] hover:text-slate-700 dark:hover:text-[#e8eaf0]",
          className,
        )}
        disabled={isPending}
        onClick={onClick}
        type="button"
      >
        {isPending ? "Signing out..." : "Logout"}
      </button>
      {error ? <p className="text-xs text-rose-500">{error}</p> : null}
    </div>
  );
}
