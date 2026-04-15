"use client";

import type { ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function Modal({ open, onClose, title, subtitle, children }: ModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-card w-full max-w-lg mx-4 p-6 relative">
        <button
          aria-label="Close"
          className="absolute top-4 right-4 inline-flex items-center justify-center rounded-lg bg-transparent text-slate-500 hover:bg-white/30 hover:text-slate-700 h-8 w-8 text-lg font-medium transition-all duration-200"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        <div className="mb-5 pr-8">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        <div className="max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
