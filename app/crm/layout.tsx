import type { ReactNode } from "react";
import { CrmShell } from "@/app/components/shells/CrmShell";
import { requireRole } from "@/app/lib/routeGuard";

export default async function CrmLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("producer");
  return <CrmShell user={user}>{children}</CrmShell>;
}
