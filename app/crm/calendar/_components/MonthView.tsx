"use client";

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import type { CalendarEvent } from "./CalendarClient";

const CATEGORY_STYLES: Record<string, { background: string; color: string }> = {
  meeting: { background: "#1a3a6b", color: "#5a9ff5" },
  call: { background: "#0d3d2a", color: "#4caf7d" },
  personal: { background: "#2a2a3e", color: "hsl(0,0%,60%)" },
  renewal: { background: "#3d2e00", color: "#f5c542" },
  task: { background: "#2a1a4a", color: "#9b7fe8" },
  other: { background: "#1e1e2e", color: "hsl(0,0%,50%)" },
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PILLS = 3;

function EventPill({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: (e: CalendarEvent) => void;
}) {
  const style = CATEGORY_STYLES[event.category] ?? CATEGORY_STYLES.other;
  const isTask = event.source_type === "task";
  const time = event.all_day
    ? null
    : format(new Date(event.start_at), "h:mm a");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(ev) => { ev.stopPropagation(); onClick(event); }}
      onKeyDown={(ev) => { if (ev.key === "Enter") onClick(event); }}
      style={{
        background: style.background,
        color: style.color,
        borderRadius: 4,
        padding: "2px 6px",
        fontSize: 11,
        fontFamily: "var(--font-instrument-sans)",
        fontWeight: 500,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        cursor: isTask ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
        marginBottom: 2,
        userSelect: "none",
      }}
      title={event.title}
    >
      {time && (
        <span style={{ opacity: 0.7, flexShrink: 0, fontSize: 10 }}>{time}</span>
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{event.title}</span>
      {isTask && (
        <span style={{ opacity: 0.6, fontSize: 10, flexShrink: 0 }}>· Task</span>
      )}
    </div>
  );
}

export function MonthView({
  currentDate,
  events,
  onDayClick,
  onEventClick,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function eventsForDay(day: Date) {
    return events.filter((e) => isSameDay(new Date(e.start_at), day));
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
      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {DAY_NAMES.map((name) => (
          <div
            key={name}
            style={{
              padding: "10px 0",
              textAlign: "center",
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 11,
              fontWeight: 500,
              color: "hsl(0,0%,50%)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
        }}
      >
        {days.map((day, idx) => {
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const dayEvents = eventsForDay(day);
          const overflow = dayEvents.length - MAX_PILLS;
          const visible = dayEvents.slice(0, MAX_PILLS);

          const isLastRow = idx >= days.length - 7;
          const isLastCol = (idx + 1) % 7 === 0;

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onDayClick(day); }}
              style={{
                minHeight: 100,
                padding: "6px 8px 6px",
                borderRight: isLastCol ? "none" : "1px solid rgba(255,255,255,0.08)",
                borderBottom: isLastRow ? "none" : "1px solid rgba(255,255,255,0.08)",
                background: today
                  ? "rgba(55,98,227,0.08)"
                  : inMonth
                  ? "transparent"
                  : "rgba(0,0,0,0.15)",
                cursor: "pointer",
                transition: "background 0.12s",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!today) {
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(255,255,255,0.03)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = today
                  ? "rgba(55,98,227,0.08)"
                  : inMonth
                  ? "transparent"
                  : "rgba(0,0,0,0.15)";
              }}
            >
              {/* Day number */}
              <div
                style={{
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 13,
                  fontWeight: today ? 700 : 400,
                  color: today
                    ? "#5a9ff5"
                    : inMonth
                    ? "hsl(0,0%,80%)"
                    : "hsl(0,0%,30%)",
                  marginBottom: 4,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {today ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#3762e3",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {format(day, "d")}
                  </span>
                ) : (
                  format(day, "d")
                )}
              </div>

              {/* Events */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {visible.map((event) => (
                  <EventPill key={event.id} event={event} onClick={onEventClick} />
                ))}
                {overflow > 0 && (
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-instrument-sans)",
                      color: "hsl(0,0%,50%)",
                      paddingLeft: 4,
                    }}
                  >
                    +{overflow} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
