import type { ReactNode } from "react";
import { AmsShell } from "@/app/components/shells/AmsShell";
import { requireRole } from "@/app/lib/routeGuard";

export default async function AmsLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("csr");
  return <AmsShell user={user}>{children}</AmsShell>;
}
