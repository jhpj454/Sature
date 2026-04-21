"use client";

import { format, isSameMonth, startOfMonth, endOfMonth, parseISO } from "date-fns";
import type { CalendarEvent } from "./CalendarClient";

const CATEGORY_STYLES: Record<string, { background: string; color: string }> = {
  meeting: { background: "#1a3a6b", color: "#5a9ff5" },
  call: { background: "#0d3d2a", color: "#4caf7d" },
  personal: { background: "#2a2a3e", color: "hsl(0,0%,60%)" },
  renewal: { background: "#3d2e00", color: "#f5c542" },
  task: { background: "#2a1a4a", color: "#9b7fe8" },
  other: { background: "#1e1e2e", color: "hsl(0,0%,50%)" },
};

function CategoryPill({ category }: { category: string }) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.other;
  return (
    <span
      style={{
        display: "inline-block",
        background: style.background,
        color: style.color,
        borderRadius: 6,
        padding: "2px 9px",
        fontSize: 11,
        fontFamily: "var(--font-instrument-sans)",
        fontWeight: 500,
        textTransform: "capitalize",
        whiteSpace: "nowrap",
      }}
    >
      {category}
    </span>
  );
}

function formatEventTime(event: CalendarEvent): string {
  if (event.all_day) return "All day";
  const start = format(parseISO(event.start_at), "h:mm a");
  if (event.end_at) {
    const end = format(parseISO(event.end_at), "h:mm a");
    return `${start} – ${end}`;
  }
  return start;
}

export function AgendaView({
  currentDate,
  events,
  onEventClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
}) {
  // Group events by date string (YYYY-MM-DD)
  const grouped = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const dateKey = event.start_at.slice(0, 10);
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(event);
  }

  const sortedDates = Array.from(grouped.keys()).sort();

  if (sortedDates.length === 0) {
    return (
      <div
        style={{
          background: "rgba(30,35,50,0.70)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16,
          padding: "48px 32px",
          textAlign: "center",
          fontFamily: "var(--font-instrument-sans)",
          fontSize: 14,
          color: "hsl(0,0%,50%)",
        }}
      >
        No events scheduled for {format(currentDate, "MMMM yyyy")}.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "rgba(30,35,50,0.70)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {sortedDates.map((dateKey, groupIdx) => {
        const dayEvents = grouped.get(dateKey)!;
        const date = parseISO(dateKey);
        const isLastGroup = groupIdx === sortedDates.length - 1;

        return (
          <div
            key={dateKey}
            style={{
              borderBottom: isLastGroup ? "none" : "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Date header */}
            <div
              style={{
                padding: "12px 20px 8px",
                background: "rgba(255,255,255,0.02)",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex",
                alignItems: "baseline",
                gap: 10,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-lora)",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "hsl(0,0%,90%)",
                }}
              >
                {format(date, "EEEE, MMMM d")}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 12,
                  color: "hsl(0,0%,45%)",
                }}
              >
                {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
              </span>
            </div>

            {/* Events */}
            {dayEvents.map((event, evtIdx) => {
              const isTask = event.source_type === "task";
              const isLast = evtIdx === dayEvents.length - 1;
              return (
                <div
                  key={event.id}
                  onClick={() => !isTask && onEventClick(event)}
                  role={isTask ? undefined : "button"}
                  tabIndex={isTask ? undefined : 0}
                  onKeyDown={(e) => {
                    if (!isTask && e.key === "Enter") onEventClick(event);
                  }}
                  style={{
                    padding: "12px 20px",
                    borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    cursor: isTask ? "default" : "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isTask) {
                      (e.currentTarget as HTMLDivElement).style.background =
                        "rgba(255,255,255,0.03)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  {/* Time */}
                  <div
                    style={{
                      fontFamily: "var(--font-instrument-sans)",
                      fontSize: 12,
                      color: "hsl(0,0%,50%)",
                      minWidth: 90,
                      paddingTop: 2,
                      flexShrink: 0,
                    }}
                  >
                    {formatEventTime(event)}
                  </div>

                  {/* Title + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: 14,
                        color: "hsl(0,0%,90%)",
                        fontWeight: 500,
                        marginBottom: event.location ? 4 : 0,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        {event.title}
                        {isTask && (
                          <span style={{ color: "#9b7fe8", fontWeight: 400, marginLeft: 4 }}>
                            (Task)
                          </span>
                        )}
                      </span>
                      <CategoryPill category={event.category} />
                    </div>
                    {event.location && (
                      <div
                        style={{
                          fontFamily: "var(--font-instrument-sans)",
                          fontSize: 12,
                          color: "hsl(0,0%,50%)",
                        }}
                      >
                        {event.location}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
