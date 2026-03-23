import type { ReactNode } from "react";
import { AppShell } from "@/app/components/shells/AppShell";
import type { AuthMeResponse } from "@/app/lib/auth";

export function AmsShell({ user, children }: { user: AuthMeResponse; children: ReactNode }) {
  return (
    <AppShell
      appName="Sature AMS"
      role={user.role}
      showTopBar
      dense
      userEmail={user.email}
      userName={user.display_name}
    >
      {children}
    </AppShell>
  );
}
