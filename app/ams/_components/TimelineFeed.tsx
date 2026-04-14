import { formatDateTime } from "@/app/ams/_lib/format";

type TimelineItem = {
  id: string;
  type: string;
  summary: string;
  created_at: string;
  created_by: string | null;
  content?: string | null;
};

type TimelineFeedProps = {
  items: TimelineItem[];
  emptyMessage?: string;
};

export function TimelineFeed({ items, emptyMessage = "No timeline entries." }: TimelineFeedProps) {
  return (
    <div
      className="rounded-2xl border border-white/50 bg-white/45 backdrop-blur-xl"
      style={{ boxShadow: "0 8px 32px rgba(31, 38, 135, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.6)" }}
    >
      <ul className="divide-y divide-slate-200/30">
        {items.map((item) => (
          <li className="px-5 py-3.5" key={item.id}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50/60 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600">
                {item.type}
              </span>
              <span className="text-xs text-slate-400">{formatDateTime(item.created_at)}</span>
              {item.created_by ? (
                <span className="text-xs text-slate-400">by {item.created_by}</span>
              ) : null}
            </div>
            <p className="text-sm font-medium text-slate-700">{item.summary}</p>
            {item.content ? <p className="mt-1 text-sm text-slate-500">{item.content}</p> : null}
          </li>
        ))}
        {items.length === 0 ? (
          <li className="px-5 py-8 text-center text-sm text-slate-400">{emptyMessage}</li>
        ) : null}
      </ul>
    </div>
  );
}
