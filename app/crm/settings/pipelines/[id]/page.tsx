import Link from "next/link";
import { InlineError } from "@/app/ams/_components/InlineError";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { Button } from "@/app/components/ui/button";
import { PipelineSettingsEditor } from "@/app/crm/_components/PipelineSettingsEditor";
import { safeApiFetchJson } from "@/app/crm/_lib/api";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Pipeline = {
  id: string;
  name: string;
  description: string | null;
  visibility_type: string;
  is_active: boolean;
};

type Stage = {
  id: string;
  name: string;
  stage_type: string;
  probability_pct: number;
  forecast_category: string;
  description: string | null;
  required_fields_json: Record<string, unknown> | null;
  sort_order: number;
};

export default async function CrmPipelineDetailPage(context: RouteContext) {
  const { id } = await context.params;

  const [pipelineRes, stagesRes] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Pipeline }>(`/api/crm/pipelines/${id}`),
    safeApiFetchJson<{ ok: true; data: Stage[] }>(`/api/crm/pipelines/${id}/stages`),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline Detail"
        description="Edit pipeline settings, stage order, and stage outcomes used by Win Deals."
        actions={
          <Link href="/crm/settings/pipelines">
            <Button size="sm" variant="outline">
              Back to Pipelines
            </Button>
          </Link>
        }
      />

      {!pipelineRes.ok ? (
        <InlineError
          details={`Status ${pipelineRes.status || 500}: ${pipelineRes.errorMessage}`}
          retryHref={`/crm/settings/pipelines/${id}`}
          title="Couldn’t load pipeline."
        />
      ) : !stagesRes.ok ? (
        <InlineError
          details={`Status ${stagesRes.status || 500}: ${stagesRes.errorMessage}`}
          retryHref={`/crm/settings/pipelines/${id}`}
          title="Couldn’t load pipeline stages."
        />
      ) : (
        <PipelineSettingsEditor pipeline={pipelineRes.data.data} stages={stagesRes.data.data} />
      )}
    </div>
  );
}
