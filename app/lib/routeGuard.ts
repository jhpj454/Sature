import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { homeRouteForRole, type AppRole, type AuthMeResponse } from "@/app/lib/auth";

function buildBaseUrl(headersList: Headers) {
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "http";

  if (!host) {
    return "http://127.0.0.1:3000";
  }

  return `${protocol}://${host}`;
}

async function getForwardedCookieHeader() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export async function fetchMeServer(): Promise<AuthMeResponse | null> {
  const headersList = await headers();
  const baseUrl = buildBaseUrl(headersList);
  const cookieHeader = await getForwardedCookieHeader();

  const response = await fetch(`${baseUrl}/api/auth/me`, {
    method: "GET",
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.status}`);
  }

  return (await response.json()) as AuthMeResponse;
}

export async function requireAuthenticatedUser() {
  const me = await fetchMeServer();
  if (!me) {
    redirect("/login");
  }
  return me;
}

export async function requireRole(role: AppRole) {
  const me = await requireAuthenticatedUser();
  if (me.role !== role) {
    redirect(homeRouteForRole(me.role));
  }
  return me;
}

export async function redirectToRoleHomeIfAuthenticated() {
  const me = await fetchMeServer();
  if (me) {
    redirect(homeRouteForRole(me.role));
  }
}
