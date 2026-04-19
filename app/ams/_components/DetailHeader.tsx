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
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "20px 24px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 600,
              color: "hsl(0,0%,100%)",
              margin: 0,
              fontFamily: "var(--font-lora, serif)",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p style={{ marginTop: "4px", fontSize: "13px", color: "hsl(0,0%,50%)", fontFamily: "var(--font-instrument-sans, sans-serif)" }}>
              {subtitle}
            </p>
          ) : null}
          {meta ? (
            <div style={{ marginTop: "10px", fontSize: "13px", color: "hsl(0,0%,65%)", fontFamily: "var(--font-instrument-sans, sans-serif)" }}>
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
