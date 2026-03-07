import type { ReactNode } from "react";
import { AppShell } from "@/app/components/shells/AppShell";
import type { AuthMeResponse } from "@/app/lib/auth";

export function MarketingShell({ user, children }: { user: AuthMeResponse; children: ReactNode }) {
  return (
    <AppShell
      appName="Saturate Marketing"
      role={user.role}
      userEmail={user.email}
      userName={user.display_name}
    >
      {children}
    </AppShell>
  );
}
