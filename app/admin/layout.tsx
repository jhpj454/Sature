import type { ReactNode } from "react";
import { AdminShell } from "@/app/components/shells/AdminShell";
import { requireRole } from "@/app/lib/routeGuard";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("admin");
  return <AdminShell user={user}>{children}</AdminShell>;
}
