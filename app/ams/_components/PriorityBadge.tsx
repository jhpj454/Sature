type PriorityBadgeProps = {
  value: string | null | undefined;
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  normal: "bg-blue-50 text-blue-700 ring-blue-200",
  high: "bg-amber-50 text-amber-700 ring-amber-200",
  urgent: "bg-rose-50 text-rose-700 ring-rose-200",
};

export function PriorityBadge({ value }: PriorityBadgeProps) {
  const priority = value ?? "normal";
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.normal;

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>
      {priority}
    </span>
  );
}
