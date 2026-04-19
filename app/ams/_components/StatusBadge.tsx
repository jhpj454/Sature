type StatusBadgeProps = {
  value: string | null | undefined;
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  open:        { bg: "rgba(52,211,153,0.15)",  color: "#34d399" },
  in_progress: { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  waiting:     { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  done:        { bg: "rgba(255,255,255,0.08)", color: "hsl(0,0%,60%)" },
  closed:      { bg: "rgba(255,255,255,0.08)", color: "hsl(0,0%,60%)" },
  completed:   { bg: "rgba(255,255,255,0.08)", color: "hsl(0,0%,60%)" },
  active:      { bg: "rgba(52,211,153,0.15)",  color: "#34d399" },
  pending:     { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24" },
  prospect:    { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  client:      { bg: "rgba(52,211,153,0.15)",  color: "#34d399" },
  lost:        { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
  posted:      { bg: "rgba(52,211,153,0.15)",  color: "#34d399" },
  void:        { bg: "rgba(248,113,113,0.15)", color: "#f87171" },
};

const DEFAULT_STYLE = { bg: "rgba(255,255,255,0.08)", color: "hsl(0,0%,60%)" };

export function StatusBadge({ value }: StatusBadgeProps) {
  const status = value ?? "unknown";
  const { bg, color } = STATUS_STYLES[status] ?? DEFAULT_STYLE;

  return (
    <span
      style={{
        display: "inline-flex",
        borderRadius: "999px",
        padding: "2px 10px",
        fontSize: "11px",
        fontWeight: 600,
        fontFamily: "var(--font-instrument-sans, sans-serif)",
        letterSpacing: "0.02em",
        background: bg,
        color,
      }}
    >
      {status}
    </span>
  );
}
