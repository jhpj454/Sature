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
        workspaceLabel="Producer Settings"
      />
      <div className="rounded-2xl border border-slate-200/30 dark:border-white/10 bg-white dark:bg-slate-800/60 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-slate-800 dark:text-slate-100">Pipelines</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
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
