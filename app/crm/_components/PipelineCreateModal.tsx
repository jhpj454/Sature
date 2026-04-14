"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/app/lib/apiClient";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";

export function PipelineCreateModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        Create Pipeline
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200/30 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Create Pipeline</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Start with insurance-native stages and adjust visibility later if needed.
                </p>
              </div>
              <Button onClick={() => setOpen(false)} size="sm" variant="outline">
                Close
              </Button>
            </div>
            <form
              className="mt-6 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setIsSaving(true);
                setError(null);
                const formData = new FormData(event.currentTarget);
                const payload = {
                  name: String(formData.get("name") || "").trim(),
                  description: String(formData.get("description") || "") || null,
                  visibility_type: String(formData.get("visibility_type") || "private"),
                  is_active: true,
                };
                try {
                  await apiFetch("/api/crm/pipelines", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  setOpen(false);
                  router.refresh();
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Unable to create pipeline.");
                } finally {
                  setIsSaving(false);
                }
              }}
            >
              <label className="space-y-1 block">
                <span className="text-sm text-slate-500">Pipeline name</span>
                <Input name="name" required />
              </label>
              <label className="space-y-1 block">
                <span className="text-sm text-slate-500">Description</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300/40 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-zinc-300 focus:ring"
                  name="description"
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-sm text-slate-500">Visibility</span>
                <Select defaultValue="private" name="visibility_type">
                  <option value="private">Private</option>
                  <option value="agency">Agency</option>
                  <option value="team">Team</option>
                </Select>
              </label>
              {error ? <p className="text-sm text-rose-500">{error}</p> : null}
              <div className="flex items-center gap-2">
                <Button disabled={isSaving} type="submit">
                  {isSaving ? "Saving..." : "Create Pipeline"}
                </Button>
                <Button onClick={() => setOpen(false)} type="button" variant="outline">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
