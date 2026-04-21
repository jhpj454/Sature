import { safeApiFetchJson } from "@/app/crm/_lib/api";
import { CalendarClient } from "./_components/CalendarClient";
import type { CalendarEvent } from "./_components/CalendarClient";

export default async function CrmCalendarPage() {
  // Fetch current month's events for SSR initial data
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const result = await safeApiFetchJson<{ ok: boolean; data: CalendarEvent[] }>(
    `/api/crm/calendar?start=${encodeURIComponent(startOfMonth)}&end=${encodeURIComponent(endOfMonth)}`,
  );

  const initialEvents = result.ok && result.data?.data ? result.data.data : [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "hsl(226,25%,8%)",
        padding: "32px 32px 64px",
      }}
    >
      {/* Page heading */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: "var(--font-lora)",
            fontSize: 28,
            fontWeight: 600,
            color: "hsl(0,0%,96%)",
            margin: 0,
            letterSpacing: "-0.01em",
          }}
        >
          Calendar
        </h1>
        <p
          style={{
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 14,
            color: "hsl(0,0%,50%)",
            margin: "6px 0 0",
          }}
        >
          Schedule meetings, calls, and follow-ups across your book of business.
        </p>
      </div>

      <CalendarClient initialEvents={initialEvents} initialDate={now.toISOString()} />
    </div>
  );
}
