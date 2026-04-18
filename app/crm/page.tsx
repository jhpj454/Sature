import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatCurrency, formatDateTime } from "@/app/ams/_lib/format";
import type { CrmDashboardData } from "@/app/api/crm/dashboard/route";
import { RevenueChart } from "./_components/RevenueChart";

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  note: "Note",
  email: "Email",
  call: "Call",
  task: "Task",
  meeting: "Meeting",
  system: "System",
  status_change: "Status Change",
  document_added: "Document Added",
};

const GLASS_CARD: React.CSSProperties = {
  background: "rgba(31, 31, 31, 0.28)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 16,
  padding: 24,
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 13,
  color: "hsl(0,0%,50%)",
  marginBottom: 8,
};

const BIG_NUMBER_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-lora)",
  fontSize: "3.5rem",
  color: "hsl(0,0%,100%)",
  fontWeight: 400,
  margin: 0,
};

const SUB_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-instrument-sans)",
  fontSize: 13,
  color: "hsl(0,0%,50%)",
  marginTop: 4,
};

export default async function CrmDashboardPage() {
  const dashboardRequest = await safeApiFetchJson<{ ok: true; data: CrmDashboardData }>(
    "/api/crm/dashboard",
  );

  const dashboard = dashboardRequest.ok ? dashboardRequest.data.data : null;

  return (
    <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: 24 }}>

      {/* Page heading */}
      <h1
        style={{
          fontFamily: "var(--font-lora)",
          fontSize: "3.5rem",
          color: "hsl(0,0%,100%)",
          fontWeight: 400,
          margin: 0,
        }}
      >
        Dashboard
      </h1>

      {!dashboardRequest.ok && (
        <p style={{ color: "#f87171", fontSize: 14, margin: 0 }}>
          {(dashboardRequest as { ok: false; errorMessage: string }).errorMessage}
        </p>
      )}

      {/* Full-width revenue chart card */}
      <div style={GLASS_CARD}>
        <h2
          style={{
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 13,
            color: "hsl(0,0%,50%)",
            marginBottom: 16,
            marginTop: 0,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Won Revenue — Last 12 Months
        </h2>
        {dashboard != null ? (
          <RevenueChart data={dashboard.revenue_by_month} />
        ) : (
          <div
            style={{
              height: 220,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "hsl(0,0%,50%)",
              fontSize: 14,
            }}
          >
            —
          </div>
        )}
      </div>

      {/* Three metric cards in a row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>

        {/* 3 Month Revenue */}
        <div style={GLASS_CARD}>
          <p style={{ ...LABEL_STYLE, margin: 0, marginBottom: 8 }}>3 Month Revenue</p>
          <p style={BIG_NUMBER_STYLE}>
            {formatCurrency(dashboard?.three_month_revenue)}
          </p>
          <p style={{ ...SUB_LABEL_STYLE, margin: 0, marginTop: 4 }}>
            {dashboard?.three_month_converted_count ?? 0} conversions
          </p>
        </div>

        {/* Opportunities */}
        <div style={GLASS_CARD}>
          <p style={{ ...LABEL_STYLE, margin: 0, marginBottom: 8 }}>Opportunities</p>
          <p style={BIG_NUMBER_STYLE}>
            {formatCurrency(dashboard?.opportunities_revenue)}
          </p>
          <p style={{ ...SUB_LABEL_STYLE, margin: 0, marginTop: 4 }}>
            {dashboard?.opportunities_count ?? 0} open leads in pipeline
          </p>
        </div>

        {/* Renewals This Month */}
        <div style={GLASS_CARD}>
          <p style={{ ...LABEL_STYLE, margin: 0, marginBottom: 8 }}>Renewals This Month</p>
          <p style={BIG_NUMBER_STYLE}>
            {dashboard?.renewals_this_month ?? 0}
          </p>
          <p style={{ ...SUB_LABEL_STYLE, margin: 0, marginTop: 4 }}>
            open renewal cases
          </p>
        </div>
      </div>

      {/* Recent Activity */}
      <div style={{ ...GLASS_CARD, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 14,
              fontWeight: 600,
              color: "hsl(0,0%,100%)",
              margin: 0,
            }}
          >
            Recent Activity
          </h2>
        </div>

        {dashboard != null && dashboard.recent_activities.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {dashboard.recent_activities.map((activity, index) => (
              <li
                key={activity.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "14px 24px",
                  borderBottom:
                    index < dashboard.recent_activities.length - 1
                      ? "1px solid rgba(255,255,255,0.06)"
                      : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#3762e3",
                    background: "rgba(55,98,227,0.12)",
                    borderRadius: 999,
                    padding: "2px 10px",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  {ACTIVITY_TYPE_LABEL[activity.activity_type] ?? activity.activity_type}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: "var(--font-instrument-sans)",
                      fontSize: 14,
                      color: "hsl(0,0%,100%)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {activity.summary ?? "(no summary)"}
                  </p>
                  {activity.entity_type ? (
                    <p
                      style={{
                        fontFamily: "var(--font-instrument-sans)",
                        fontSize: 12,
                        color: "hsl(0,0%,50%)",
                        margin: 0,
                        marginTop: 2,
                      }}
                    >
                      {activity.entity_type.replace(/_/g, " ")}
                    </p>
                  ) : null}
                </div>
                <time
                  style={{
                    fontFamily: "var(--font-instrument-sans)",
                    fontSize: 12,
                    color: "hsl(0,0%,50%)",
                    flexShrink: 0,
                  }}
                >
                  {formatDateTime(activity.created_at)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p
            style={{
              fontFamily: "var(--font-instrument-sans)",
              fontSize: 14,
              color: "hsl(0,0%,50%)",
              textAlign: "center",
              padding: "32px 24px",
              margin: 0,
            }}
          >
            {dashboard != null ? "No recent activity." : "—"}
          </p>
        )}
      </div>
    </div>
  );
}
