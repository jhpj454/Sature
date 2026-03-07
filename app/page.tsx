import { redirect } from "next/navigation";
import { homeRouteForRole } from "@/app/lib/auth";
import { fetchMeServer } from "@/app/lib/routeGuard";

export default async function HomePage() {
  const me = await fetchMeServer();

  if (!me) {
    redirect("/login");
  }

  redirect(homeRouteForRole(me.role));
}
