import Link from "next/link";

type TabItem = {
  label: string;
  href: string;
  value: string;
};

export function Tabs({
  items,
  active,
}: {
  items: TabItem[];
  active: string;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
      {items.map((item) => {
        const isActive = active === item.value;
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "var(--font-instrument-sans, sans-serif)",
              textDecoration: "none",
              color: isActive ? "hsl(0,0%,100%)" : "hsl(0,0%,50%)",
              background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                (e.currentTarget as HTMLElement).style.color = "hsl(0,0%,75%)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "hsl(0,0%,50%)";
              }
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
