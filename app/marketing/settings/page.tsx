import { SettingsContent } from "@/app/components/settings/SettingsContent";
import { requireRole } from "@/app/lib/routeGuard";

export default async function MarketingSettingsPage() {
  const user = await requireRole("marketing");

  return (
    <SettingsContent
      placeholderTitle="Marketing preferences coming soon"
      user={user}
      workspaceLabel="Saturate Marketing"
    />
  );
}
