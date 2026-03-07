export type AppRole = "producer" | "csr" | "marketing" | "admin";

export type AuthMeResponse = {
  ok: true;
  user_id: string;
  agency_id: string;
  email: string;
  display_name: string;
  role: AppRole;
  status: string;
};

export type LoginResponse = {
  ok: true;
  user: {
    id: string;
    agency_id: string;
    email: string;
    display_name: string;
    role: AppRole;
  };
  expires_at: string;
};

export function homeRouteForRole(role: AppRole): string {
  switch (role) {
    case "producer":
      return "/crm";
    case "csr":
      return "/ams";
    case "marketing":
      return "/marketing";
    case "admin":
      return "/admin";
    default:
      return "/login";
  }
}

export function settingsRouteForRole(role: AppRole): string {
  switch (role) {
    case "producer":
      return "/crm/settings";
    case "csr":
      return "/ams/settings";
    case "marketing":
      return "/marketing/settings";
    case "admin":
      return "/admin/settings";
    default:
      return "/login";
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export async function fetchMe(): Promise<AuthMeResponse | null> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const data = await parseJson<{ error?: string }>(response);
    throw new Error(data.error ?? "Failed to fetch current user.");
  }

  return parseJson<AuthMeResponse>(response);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const data = await parseJson<{ error?: string }>(response);
    throw new Error(data.error ?? "Login failed.");
  }

  return parseJson<LoginResponse>(response);
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const data = await parseJson<{ error?: string }>(response);
    throw new Error(data.error ?? "Logout failed.");
  }
}
