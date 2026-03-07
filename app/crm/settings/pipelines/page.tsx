import Link from "next/link";
import { InlineError } from "@/app/ams/_components/InlineError";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { PipelineCreateModal } from "@/app/crm/_components/PipelineCreateModal";
import { safeApiFetchJson } from "@/app/crm/_lib/api";

type Pipeline = {
  id: string;
  name: string;
  description: string | null;
  visibility_type: string;
  owner_display_name?: string | null;
  stage_count?: number;
  is_active: boolean;
};

export default async function CrmPipelineSettingsPage() {
  const pipelinesRes = await safeApiFetchJson<{ ok: true; data: Pipeline[] }>(
    "/api/crm/pipelines?page_size=100",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline Settings"
        description="Manage visible pipelines and keep stage definitions aligned with the producer workflow."
        actions={<PipelineCreateModal />}
      />

      {!pipelinesRes.ok ? (
        <InlineError
          details={`Status ${pipelinesRes.status || 500}: ${pipelinesRes.errorMessage}`}
          retryHref="/crm/settings/pipelines"
          title="Couldn’t load pipelines."
        />
      ) : pipelinesRes.data.data.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No pipelines available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-600">
              Create your first producer pipeline to unlock board and table views in Win Deals.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pipelinesRes.data.data.map((pipeline) => (
            <Card key={pipeline.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-zinc-900">{pipeline.name}</CardTitle>
                    <p className="mt-1 text-sm text-zinc-500">
                      {pipeline.description ?? "No description yet."}
                    </p>
                  </div>
                  <Badge variant="outline">{pipeline.visibility_type}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 text-sm text-zinc-600 md:grid-cols-2">
                  <p>
                    <span className="font-medium text-zinc-700">Owner:</span>{" "}
                    {pipeline.owner_display_name ?? "-"}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-700">Stages:</span>{" "}
                    {pipeline.stage_count ?? 0}
                  </p>
                  <p>
                    <span className="font-medium text-zinc-700">Status:</span>{" "}
                    {pipeline.is_active ? "Active" : "Inactive"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/crm/settings/pipelines/${pipeline.id}`}>
                    <Button size="sm">Open Settings</Button>
                  </Link>
                  <Link href={`/crm/win-deals?pipeline_id=${pipeline.id}`}>
                    <Button size="sm" variant="outline">
                      Open Win Deals
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
