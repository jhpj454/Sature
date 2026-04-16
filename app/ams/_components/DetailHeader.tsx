import type { ReactNode } from "react";

type DetailHeaderProps = {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function DetailHeader({ title, subtitle, meta, actions }: DetailHeaderProps) {
  return (
    <div
      className="rounded-2xl border border-white/50 bg-white/45 p-5 backdrop-blur-xl"
      style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          {meta ? <div className="mt-2 text-sm text-slate-500">{meta}</div> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
