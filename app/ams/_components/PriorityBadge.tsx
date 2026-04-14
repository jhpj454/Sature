type PriorityBadgeProps = {
  value: string | null | undefined;
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-slate-100/60 text-slate-500",
  normal: "bg-blue-50/60 text-blue-600",
  high: "bg-amber-50/60 text-amber-600",
  urgent: "bg-rose-50/60 text-rose-500",
};

export function PriorityBadge({ value }: PriorityBadgeProps) {
  const priority = value ?? "normal";
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal;

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${style}`}>
      {priority}
    </span>
  );
}
