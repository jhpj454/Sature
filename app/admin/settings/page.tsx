import { SettingsContent } from "@/app/components/settings/SettingsContent";
import { requireRole } from "@/app/lib/routeGuard";

export default async function AdminSettingsPage() {
  const user = await requireRole("admin");

  return (
    <SettingsContent
      placeholderTitle="Workspace configuration coming soon"
      user={user}
      workspaceLabel="Saturate Admin"
    />
  );
}
