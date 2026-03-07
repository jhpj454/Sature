import type { ReactNode } from "react";
import { MarketingShell } from "@/app/components/shells/MarketingShell";
import { requireRole } from "@/app/lib/routeGuard";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("marketing");
  return <MarketingShell user={user}>{children}</MarketingShell>;
}
