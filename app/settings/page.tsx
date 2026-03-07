import { redirect } from "next/navigation";
import { settingsRouteForRole } from "@/app/lib/auth";
import { requireAuthenticatedUser } from "@/app/lib/routeGuard";

export default async function SettingsPage() {
  const user = await requireAuthenticatedUser();
  redirect(settingsRouteForRole(user.role));
}
