type StatusBadgeProps = {
  value: string | null | undefined;
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-200",
  waiting: "bg-amber-50 text-amber-700 ring-amber-200",
  done: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  closed: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  completed: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  posted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  void: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function StatusBadge({ value }: StatusBadgeProps) {
  const status = value ?? "unknown";
  const style = STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
      {status}
    </span>
  );
}
