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
    <div className="rounded-xl border border-white/60 bg-white/75 shadow-sm backdrop-blur-sm">
      <ul className="divide-y divide-zinc-200/50">
        {items.map((item) => (
          <li className="px-4 py-3" key={item.id}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-sky-50/80 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200/60">
                {item.type}
              </span>
              <span className="text-xs text-zinc-500">{formatDateTime(item.created_at)}</span>
              {item.created_by ? (
                <span className="text-xs text-zinc-500">by {item.created_by}</span>
              ) : null}
            </div>
            <p className="text-sm font-medium text-zinc-900">{item.summary}</p>
            {item.content ? <p className="mt-1 text-sm text-zinc-600">{item.content}</p> : null}
          </li>
        ))}
        {items.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-zinc-400">{emptyMessage}</li>
        ) : null}
      </ul>
    </div>
  );
}
