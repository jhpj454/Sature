"use client";

import { useState, useCallback } from "react";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  format,
} from "date-fns";
import { MonthView } from "./MonthView";
import { AgendaView } from "./AgendaView";
import { CreateEventModal } from "./CreateEventModal";

export type CalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  category: string;
  source_type: "activity" | "task";
  recurrence_rule?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: Record<string, unknown> | null;
  created_by_name?: string | null;
  // task-specific
  status?: string;
  assignee_display_name?: string | null;
  // recurrence expansion
  parent_id?: string;
};

type ViewMode = "month" | "agenda";

type ModalState =
  | { mode: "create"; defaultDate?: Date }
  | { mode: "edit"; event: CalendarEvent }
  | null;

const BTN: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  padding: "7px 16px",
  cursor: "pointer",
  transition: "background 0.15s, color 0.15s",
  background: "transparent",
  color: "hsl(0,0%,70%)",
};

const BTN_ACTIVE: React.CSSProperties = {
  ...BTN,
  background: "rgba(255,255,255,0.1)",
  color: "hsl(0,0%,96%)",
};

const BTN_PRIMARY: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 14,
  fontWeight: 500,
  background: "#3762e3",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "9px 20px",
  cursor: "pointer",
};

export function CalendarClient({
  initialEvents,
  initialDate,
}: {
  initialEvents: CalendarEvent[];
  initialDate: string;
}) {
  const [currentDate, setCurrentDate] = useState<Date>(new Date(initialDate));
  const [view, setView] = useState<ViewMode>("month");
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState<ModalState>(null);

  const fetchEvents = useCallback(async (date: Date) => {
    setLoading(true);
    try {
      const start = startOfMonth(date).toISOString();
      const end = endOfMonth(date).toISOString();
      const res = await fetch(
        `/api/crm/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      );
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setEvents(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePrevMonth = () => {
    const next = subMonths(currentDate, 1);
    setCurrentDate(next);
    fetchEvents(next);
  };

  const handleNextMonth = () => {
    const next = addMonths(currentDate, 1);
    setCurrentDate(next);
    fetchEvents(next);
  };

  const handleDayClick = (date: Date) => {
    setModalState({ mode: "create", defaultDate: date });
  };

  const handleEventClick = (event: CalendarEvent) => {
    if (event.source_type === "task") return; // tasks are read-only
    setModalState({ mode: "edit", event });
  };

  const handleModalSave = () => {
    setModalState(null);
    fetchEvents(currentDate);
  };

  const handleModalDelete = () => {
    setModalState(null);
    fetchEvents(currentDate);
  };

  return (
    <>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Left: nav + month title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={BTN} onClick={handlePrevMonth} aria-label="Previous month">
            ‹
          </button>
          <span
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: 20,
              fontWeight: 600,
              color: "hsl(0,0%,96%)",
              minWidth: 180,
              textAlign: "center",
            }}
          >
            {format(currentDate, "MMMM yyyy")}
          </span>
          <button style={BTN} onClick={handleNextMonth} aria-label="Next month">
            ›
          </button>
          {loading && (
            <span
              style={{
                fontSize: 12,
                color: "hsl(0,0%,45%)",
                fontFamily: "var(--font-instrument-sans)",
              }}
            >
              Loading…
            </span>
          )}
        </div>

        {/* Right: view toggle + new event */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            style={view === "month" ? BTN_ACTIVE : BTN}
            onClick={() => setView("month")}
          >
            Month
          </button>
          <button
            style={view === "agenda" ? BTN_ACTIVE : BTN}
            onClick={() => setView("agenda")}
          >
            Agenda
          </button>
          <button
            style={BTN_PRIMARY}
            onClick={() => setModalState({ mode: "create" })}
          >
            + New Event
          </button>
        </div>
      </div>

      {/* Calendar body */}
      {view === "month" ? (
        <MonthView
          currentDate={currentDate}
          events={events}
          onDayClick={handleDayClick}
          onEventClick={handleEventClick}
        />
      ) : (
        <AgendaView
          currentDate={currentDate}
          events={events}
          onEventClick={handleEventClick}
        />
      )}

      {/* Modal */}
      {modalState && (
        <CreateEventModal
          mode={modalState.mode}
          event={modalState.mode === "edit" ? modalState.event : undefined}
          defaultDate={modalState.mode === "create" ? modalState.defaultDate : undefined}
          onClose={() => setModalState(null)}
          onSave={handleModalSave}
          onDelete={handleModalDelete}
        />
      )}
    </>
  );
}
