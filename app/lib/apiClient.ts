export class ApiClientError extends Error {
  status: number;
  path: string;

  constructor(path: string, status: number, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.path = path;
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    const message = payload?.error ?? payload?.message ?? `Request failed (${response.status})`;
    throw new ApiClientError(path, response.status, message);
  }

  return (await response.json()) as T;
}
