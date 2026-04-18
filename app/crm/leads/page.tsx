import { safeApiFetchJson, requireSession } from "@/app/crm/_lib/api";
import { LeadsTable, type Lead, type Pipeline } from "./LeadsTable";

export default async function CrmLeadsPage() {
  await requireSession();

  const [leadsRes, pipelinesRes] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Lead[] }>("/api/crm/leads?view=mine&page_size=100"),
    safeApiFetchJson<{ ok: true; data: Pipeline[] }>("/api/crm/pipelines?page_size=100"),
  ]);

  const leads = leadsRes.ok ? leadsRes.data.data : [];
  const pipelines = pipelinesRes.ok ? pipelinesRes.data.data : [];

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1
          style={{
            fontFamily: "var(--font-lora)",
            fontSize: "2rem",
            color: "hsl(0,0%,100%)",
            margin: 0,
          }}
        >
          Leads
        </h1>
      </div>

      {!leadsRes.ok && (
        <div
          style={{
            background: "rgba(61,13,13,0.7)",
            border: "1px solid rgba(224,82,82,0.3)",
            borderRadius: 12,
            padding: "16px 20px",
            color: "#e05252",
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 14,
          }}
        >
          Unable to load leads: {leadsRes.errorMessage}
        </div>
      )}

      <LeadsTable leads={leads} pipelines={pipelines} />
    </div>
  );
}
