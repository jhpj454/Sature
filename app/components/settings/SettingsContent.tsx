import { PageHeader } from "@/app/ams/_components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import type { AuthMeResponse } from "@/app/lib/auth";

type SettingsContentProps = {
  user: AuthMeResponse;
  workspaceLabel: string;
  placeholderTitle: string;
};

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-zinc-200 py-3 last:border-b-0 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <span className="text-sm font-medium text-zinc-500">{label}</span>
      <span className="break-words text-sm text-zinc-900">{value}</span>
    </div>
  );
}

export function SettingsContent({
  user,
  workspaceLabel,
  placeholderTitle,
}: SettingsContentProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account and session settings"
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <SettingsRow label="Display Name" value={user.display_name} />
            <SettingsRow label="Email" value={user.email} />
            <SettingsRow label="Role" value={user.role} />
            <SettingsRow label="Agency" value={user.agency_id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <SettingsRow label="Current workspace" value={workspaceLabel} />
            <SettingsRow label="Session context" value={`${user.display_name} · ${user.email}`} />
            <SettingsRow label="Agency scope" value={user.agency_id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-zinc-600">{placeholderTitle}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
