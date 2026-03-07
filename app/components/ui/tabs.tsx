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
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          className={cn(
            "rounded border px-3 py-1.5 text-sm",
            active === item.value
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 bg-white text-zinc-700",
          )}
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
