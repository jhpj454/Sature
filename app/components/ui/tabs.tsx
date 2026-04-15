import Link from "next/link";
import { cn } from "@/app/lib/cn";

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
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Link
          className={cn(
            "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
            active === item.value
              ? "bg-white/60 dark:bg-white/10 text-slate-800 dark:text-[#e8eaf0] shadow-sm backdrop-blur-sm"
              : "text-slate-400 dark:text-[#7b8494] hover:bg-white/30 dark:hover:bg-white/8 hover:text-slate-600 dark:hover:text-[#7b8494]",
          )}
          href={item.href}
          key={item.href}
          style={active === item.value ? { boxShadow: "0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)" } : undefined}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
