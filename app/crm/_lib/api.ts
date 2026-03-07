import { requireSession, safeApiFetchJson } from "@/app/ams/_lib/api";

export { requireSession, safeApiFetchJson };

export function buildCrmQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}
