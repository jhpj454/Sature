import Link from "next/link";
import { Button } from "@/app/components/ui/button";
import { SettingsContent } from "@/app/components/settings/SettingsContent";
import { requireRole } from "@/app/lib/routeGuard";

export default async function CrmSettingsPage() {
  const user = await requireRole("producer");

  return (
    <div className="space-y-6">
      <SettingsContent
        placeholderTitle="Sales preferences coming soon"
        user={user}
        workspaceLabel="Sature CRM"
      />
      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-zinc-900">Pipelines</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Manage producer pipelines, stage definitions, and Win Deals workflow settings.
            </p>
          </div>
          <Link href="/crm/settings/pipelines">
            <Button size="sm" variant="outline">
              Open Pipeline Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
