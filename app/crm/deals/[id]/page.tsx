import Link from "next/link";
import { notFound } from "next/navigation";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { DetailHeader } from "@/app/ams/_components/DetailHeader";
import { InlineError } from "@/app/ams/_components/InlineError";
import { DealSidebar } from "./DealSidebar";
import { ActivityPanel } from "./ActivityPanel";

type Deal = {
  id: string;
  name: string;
  status: string;
  stage_name: string;
  stage_type: string;
  pipeline_id: string;
  pipeline_stage_id: string;
  pipeline_name: string;
  estimated_revenue: string | number;
  expected_close_date: string | null;
  producer_display_name: string | null;
  account_id: string | null;
  account_name: string | null;
  lead_id: string | null;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_company_name: string | null;
  next_step: string | null;
};

type Stage = {
  id: string;
  name: string;
  stage_type: string;
  sort_order: number;
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

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dealRequest = await safeApiFetchJson<{ ok: true; data: Deal }>(
    `/api/crm/deals/${id}`,
  );

  if (!dealRequest.ok) {
    if (dealRequest.status === 404) notFound();
    return (
      <InlineError
        details={dealRequest.errorMessage}
        retryHref="/crm/win-deals"
      />
    );
  }

  const deal = dealRequest.data.data;
  if (!deal) notFound();

  const [stagesRequest, activitiesRequest] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Stage[] }>(
      `/api/crm/pipelines/${deal.pipeline_id}/stages`,
    ),
    safeApiFetchJson<{ ok: true; data: Activity[] }>(
      `/api/crm/deals/${id}/activities`,
    ),
  ]);

  const stages = stagesRequest.ok ? stagesRequest.data.data : [];
  const activities = activitiesRequest.ok ? activitiesRequest.data.data : [];

  return (
    <div className="space-y-6">
      <DetailHeader
        title={deal.name}
        subtitle={`${deal.pipeline_name} · ${deal.stage_name}`}
        actions={
          <Link className="text-sm text-blue-700 hover:underline" href="/crm/win-deals">
            Back to Deals
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left — activity panel */}
        <ActivityPanel dealId={deal.id} initialActivities={activities} />

        {/* Right — metadata + stage selector */}
        <DealSidebar deal={deal} stages={stages} />
      </div>
    </div>
  );
}
