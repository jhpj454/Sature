"use client";

import { PageHeader } from "@/app/ams/_components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import type { AuthMeResponse } from "@/app/lib/auth";

type SettingsContentProps = {
  user: AuthMeResponse;
  workspaceLabel: string;
  placeholderTitle: string;
};

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-slate-200/30 dark:border-white/8 py-3 last:border-b-0 last:pb-0 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <span className="text-sm font-medium text-slate-400 dark:text-slate-400">{label}</span>
      <span className="break-words text-sm text-slate-800 dark:text-slate-200">{value}</span>
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
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{placeholderTitle}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Color theme</p>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Choose between light and dark mode. Dark mode is the default.
                </p>
              </div>
              <ThemeToggle />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
