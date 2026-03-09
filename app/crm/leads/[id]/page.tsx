import { notFound } from "next/navigation";
import { safeApiFetchJson } from "@/app/crm/_lib/api";
import { DetailHeader } from "@/app/ams/_components/DetailHeader";
import { InlineError } from "@/app/ams/_components/InlineError";
import { LeadSidebar } from "./LeadSidebar";
import { LeadActivityPanel } from "./LeadActivityPanel";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  assigned_producer_id: string | null;
  assignment_status: string;
  lead_list_id: string | null;
  created_at: string;
  updated_at: string;
};

type Activity = {
  id: string;
  activity_type: "note" | "call" | "email" | "meeting" | "task";
  summary: string;
  occurred_at: string;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
};

type Pipeline = {
  id: string;
  name: string;
};

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const leadRequest = await safeApiFetchJson<{ ok: true; data: Lead }>(
    `/api/crm/leads/${id}`,
  );

  if (!leadRequest.ok) {
    if (leadRequest.status === 404) notFound();
    return (
      <InlineError
        details={leadRequest.errorMessage}
        retryHref="/crm/leads"
      />
    );
  }

  const lead = leadRequest.data.data;
  if (!lead) notFound();

  const displayName =
    lead.company_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
    "Lead";

  const [activitiesRequest, pipelinesRequest] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Activity[] }>(
      `/api/crm/leads/${id}/activities`,
    ),
    safeApiFetchJson<{ ok: true; data: Pipeline[] }>(
      `/api/crm/pipelines?page_size=100`,
    ),
  ]);

  const activities = activitiesRequest.ok ? activitiesRequest.data.data : [];
  const pipelines = pipelinesRequest.ok ? pipelinesRequest.data.data : [];

  return (
    <div className="space-y-6">
      <DetailHeader
        title={displayName}
        subtitle={`Lead · ${lead.status}`}
        actions={
          <a className="text-sm text-blue-700 hover:underline" href="/crm/leads">
            Back to Leads
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left — activity panel */}
        <LeadActivityPanel leadId={lead.id} initialActivities={activities} />

        {/* Right — metadata + actions */}
        <LeadSidebar lead={lead} pipelines={pipelines} />
      </div>
    </div>
  );
}
