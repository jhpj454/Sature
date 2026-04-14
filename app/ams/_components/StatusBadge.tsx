type StatusBadgeProps = {
  value: string | null | undefined;
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-50/60 text-emerald-600",
  in_progress: "bg-blue-50/60 text-blue-600",
  waiting: "bg-amber-50/60 text-amber-600",
  done: "bg-slate-100/60 text-slate-500",
  closed: "bg-slate-100/60 text-slate-500",
  completed: "bg-slate-100/60 text-slate-500",
  active: "bg-emerald-50/60 text-emerald-600",
  pending: "bg-amber-50/60 text-amber-600",
  posted: "bg-emerald-50/60 text-emerald-600",
  void: "bg-rose-50/60 text-rose-500",
};

export function StatusBadge({ value }: StatusBadgeProps) {
  const status = value ?? "unknown";
  const style = STATUS_STYLES[status] ?? "bg-slate-100/60 text-slate-500";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style}`}>
      {status}
    </span>
  );
}
