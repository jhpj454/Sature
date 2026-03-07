"use client";

import type { ReactNode } from "react";
import { Button } from "@/app/components/ui/button";

type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, title, onClose, children }: SheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true">
      <button
        aria-label="Close panel"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        type="button"
      />
      <div className="relative h-full w-72 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <Button aria-label="Close panel" onClick={onClose} size="sm" variant="outline">
            ×
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
