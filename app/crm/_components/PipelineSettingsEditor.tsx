"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";

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

export function PipelineSettingsEditor({
  pipeline,
  stages,
}: {
  pipeline: Pipeline;
  stages: Stage[];
}) {
  const router = useRouter();
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [stageModalOpen, setStageModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline details</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setPipelineError(null);
              const formData = new FormData(event.currentTarget);
              try {
                await apiFetch(`/api/crm/pipelines/${pipeline.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: String(formData.get("name") || "").trim(),
                    description: String(formData.get("description") || "") || null,
                    visibility_type: String(formData.get("visibility_type") || "private"),
                    is_active: String(formData.get("is_active") || "true") === "true",
                  }),
                });
                router.refresh();
              } catch (caught) {
                setPipelineError(caught instanceof Error ? caught.message : "Unable to update pipeline.");
              }
            }}
          >
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm text-slate-500">Pipeline name</span>
              <Input defaultValue={pipeline.name} name="name" required />
            </label>
            <label className="space-y-1 md:col-span-2">
              <span className="text-sm text-slate-500">Description</span>
              <textarea
                className="min-h-24 w-full rounded-md border border-slate-300/40 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-zinc-300 focus:ring"
                defaultValue={pipeline.description ?? ""}
                name="description"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-500">Visibility</span>
              <Select defaultValue={pipeline.visibility_type} name="visibility_type">
                <option value="private">Private</option>
                <option value="agency">Agency</option>
                <option value="team">Team</option>
              </Select>
            </label>
            <label className="space-y-1">
              <span className="text-sm text-slate-500">Active</span>
              <Select defaultValue={pipeline.is_active ? "true" : "false"} name="is_active">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </label>
            {pipelineError ? <p className="text-sm text-rose-500 md:col-span-2">{pipelineError}</p> : null}
            <div className="md:col-span-2">
              <Button type="submit">Save Pipeline</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Stages</CardTitle>
          <Button onClick={() => setStageModalOpen(true)} size="sm">Add Stage</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {stages.map((stage) => (
            <form
              className="grid gap-3 rounded-xl border border-slate-200/30 p-4"
              key={stage.id}
              onSubmit={async (event) => {
                event.preventDefault();
                setStageError(null);
                const formData = new FormData(event.currentTarget);
                try {
                  await apiFetch(`/api/crm/pipelines/${pipeline.id}/stages/${stage.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: String(formData.get("name") || "").trim(),
                      stage_type: String(formData.get("stage_type") || "open"),
                      forecast_category: String(formData.get("forecast_category") || "pipeline"),
                      probability_pct: Number(formData.get("probability_pct") || 0),
                      sort_order: Number(formData.get("sort_order") || stage.sort_order),
                      description: String(formData.get("description") || "") || null,
                    }),
                  });
                  router.refresh();
                } catch (caught) {
                  setStageError(caught instanceof Error ? caught.message : "Unable to update stage.");
                }
              }}
            >
              <div className="grid gap-3 md:grid-cols-[1.5fr,1fr,1fr,120px,120px]">
                <label className="space-y-1">
                  <span className="text-sm text-slate-500">Name</span>
                  <Input defaultValue={stage.name} name="name" required />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-500">Stage type</span>
                  <Select defaultValue={stage.stage_type} name="stage_type">
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-500">Forecast</span>
                  <Select defaultValue={stage.forecast_category} name="forecast_category">
                    <option value="pipeline">Pipeline</option>
                    <option value="best_case">Best Case</option>
                    <option value="commit">Commit</option>
                    <option value="closed">Closed</option>
                    <option value="omitted">Omitted</option>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-500">Probability %</span>
                  <Input defaultValue={stage.probability_pct} max="100" min="0" name="probability_pct" type="number" />
                </label>
                <label className="space-y-1">
                  <span className="text-sm text-slate-500">Sort order</span>
                  <Input defaultValue={stage.sort_order} min="1" name="sort_order" type="number" />
                </label>
              </div>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Description</span>
                <Input defaultValue={stage.description ?? ""} name="description" />
              </label>
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" type="submit">Save</Button>
                <Button
                  onClick={async () => {
                    setStageError(null);
                    try {
                      await apiFetch(`/api/crm/pipelines/${pipeline.id}/stages/${stage.id}`, {
                        method: "DELETE",
                      });
                      router.refresh();
                    } catch (caught) {
                      setStageError(caught instanceof Error ? caught.message : "Unable to delete stage.");
                    }
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Delete
                </Button>
              </div>
            </form>
          ))}
          {stageError ? <p className="text-sm text-rose-500">{stageError}</p> : null}
        </CardContent>
      </Card>

      {stageModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200/30 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Add Stage</h2>
                <p className="mt-1 text-sm text-slate-400">Create a new editable stage for this pipeline.</p>
              </div>
              <Button onClick={() => setStageModalOpen(false)} size="sm" variant="outline">Close</Button>
            </div>
            <form
              className="mt-6 grid gap-4 md:grid-cols-2"
              onSubmit={async (event) => {
                event.preventDefault();
                setStageError(null);
                const formData = new FormData(event.currentTarget);
                try {
                  await apiFetch(`/api/crm/pipelines/${pipeline.id}/stages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: String(formData.get("name") || "").trim(),
                      stage_type: String(formData.get("stage_type") || "open"),
                      forecast_category: String(formData.get("forecast_category") || "pipeline"),
                      probability_pct: Number(formData.get("probability_pct") || 0),
                      sort_order: String(formData.get("sort_order") || "")
                        ? Number(formData.get("sort_order"))
                        : undefined,
                      description: String(formData.get("description") || "") || null,
                    }),
                  });
                  setStageModalOpen(false);
                  router.refresh();
                } catch (caught) {
                  setStageError(caught instanceof Error ? caught.message : "Unable to create stage.");
                }
              }}
            >
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-slate-500">Name</span>
                <Input name="name" required />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Stage type</span>
                <Select defaultValue="open" name="stage_type">
                  <option value="open">Open</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Forecast</span>
                <Select defaultValue="pipeline" name="forecast_category">
                  <option value="pipeline">Pipeline</option>
                  <option value="best_case">Best Case</option>
                  <option value="commit">Commit</option>
                  <option value="closed">Closed</option>
                  <option value="omitted">Omitted</option>
                </Select>
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Probability %</span>
                <Input defaultValue="50" max="100" min="0" name="probability_pct" type="number" />
              </label>
              <label className="space-y-1">
                <span className="text-sm text-slate-500">Sort order</span>
                <Input min="1" name="sort_order" type="number" />
              </label>
              <label className="space-y-1 md:col-span-2">
                <span className="text-sm text-slate-500">Description</span>
                <Input name="description" />
              </label>
              {stageError ? <p className="text-sm text-rose-500 md:col-span-2">{stageError}</p> : null}
              <div className="flex items-center gap-2 md:col-span-2">
                <Button type="submit">Add Stage</Button>
                <Button onClick={() => setStageModalOpen(false)} type="button" variant="outline">Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
