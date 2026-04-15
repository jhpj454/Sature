import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApiClientError } from "@/app/lib/apiClient";

type SessionUser = {
  user_id: string;
  agency_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
};

function buildBaseUrlFromHeaders(headersList: Headers) {
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "http";

  if (!host) {
    return "http://127.0.0.1:3000";
  }

  return `${protocol}://${host}`;
}

async function fetchWithSessionCookies(path: string, init?: RequestInit) {
  const headersList = await headers();
  const cookieStore = await cookies();
  const baseUrl = buildBaseUrlFromHeaders(headersList);

  const requestHeaders = new Headers(init?.headers ?? {});
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  if (cookieHeader) {
    requestHeaders.set("cookie", cookieHeader);
  }

  const requestUrl = `${baseUrl}${path}`;

  const response = await fetch(requestUrl, {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
  });

  return { response, requestUrl };
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { response } = await fetchWithSessionCookies(path, init);

  if (response.status === 401) {
    redirect("/login");
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    const message =
      payload?.error ??
      payload?.message ??
      `API request failed for ${path}: ${response.status}`;
    throw new ApiClientError(path, response.status, message);
  }

  return response.json() as Promise<T>;
}

export type SafeApiFetchResult<T> =
  | {
      ok: true;
      status: number;
      data: T;
      requestUrl: string;
      responsePreview: string;
    }
  | {
      ok: false;
      status: number;
      errorMessage: string;
      requestUrl: string;
      responsePreview: string;
    };

export async function safeApiFetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<SafeApiFetchResult<T>> {
  try {
    const { response, requestUrl } = await fetchWithSessionCookies(path, init);
    const rawText = await response.text();
    const parsedPayload = (() => {
      if (!rawText) return null;
      try {
        return JSON.parse(rawText) as T | { error?: string; message?: string };
      } catch {
        return null;
      }
    })();
    const responsePreview = rawText.slice(0, 500);

    if (!response.ok) {
      const message =
        (parsedPayload as { error?: string; message?: string } | null)?.error ??
        (parsedPayload as { error?: string; message?: string } | null)?.message ??
        `API request failed for ${path}: ${response.status}`;

      return {
        ok: false,
        status: response.status,
        errorMessage: message,
        requestUrl,
        responsePreview,
      };
    }

    return {
      ok: true,
      status: response.status,
      data: parsedPayload as T,
      requestUrl,
      responsePreview,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 0,
      errorMessage: `Network error while calling ${path}: ${message}`,
      requestUrl: path,
      responsePreview: "",
    };
  }
}

export async function safeApiFetch<T>(path: string, init?: RequestInit) {
  try {
    const data = await apiFetch<T>(path, init);
    return { data, error: null as ApiClientError | null };
  } catch (error) {
    if (error instanceof ApiClientError) {
      return { data: null as T | null, error };
    }
    throw error;
  }
}

export async function requireSession() {
  const session = await apiFetch<SessionUser & { ok: true }>("/api/auth/me");
  return session;
}
