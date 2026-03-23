import { SettingsContent } from "@/app/components/settings/SettingsContent";
import { requireRole } from "@/app/lib/routeGuard";

export default async function AmsSettingsPage() {
  const user = await requireRole("csr");

  return (
    <SettingsContent
      placeholderTitle="Preferences coming soon"
      user={user}
      workspaceLabel="Sature AMS"
    />
  );
}
