import type { ReactNode } from "react";
import { AppShell } from "@/app/components/shells/AppShell";
import type { AuthMeResponse } from "@/app/lib/auth";

export function CrmShell({ user, children }: { user: AuthMeResponse; children: ReactNode }) {
  return (
    <AppShell
      appName="Saturate CRM"
      role={user.role}
      userEmail={user.email}
      userName={user.display_name}
    >
      {children}
    </AppShell>
  );
}
