const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const RENEWAL_STATUS_SET = new Set([
  "not_started",
  "in_progress",
  "quoted",
  "bound",
  "lost",
]);

export type CanonicalPolicyFilters = {
  from?: string;
  to?: string;
  status?: string;
  assigned_to?: string;
};

function pad2(value: string) {
  return value.padStart(2, "0");
}

function isValidIsoDate(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function normalizeDateToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (ISO_DATE_RE.test(trimmed) && isValidIsoDate(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(SLASH_DATE_RE);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const iso = `${year}-${pad2(month)}-${pad2(day)}`;
    if (isValidIsoDate(iso)) {
      return iso;
    }
  }

  return undefined;
}

export function parseCanonicalPolicyFilters(
  searchParams: Record<string, string | string[] | undefined>,
): CanonicalPolicyFilters {
  const from = normalizeDateToIso(
    typeof searchParams.from === "string"
      ? searchParams.from
      : typeof searchParams.expiring_after === "string"
        ? searchParams.expiring_after
        : undefined,
  );

  const to = normalizeDateToIso(
    typeof searchParams.to === "string"
      ? searchParams.to
      : typeof searchParams.expiring_before === "string"
        ? searchParams.expiring_before
        : undefined,
  );

  const status =
    typeof searchParams.status === "string" && searchParams.status.trim()
      ? searchParams.status.trim()
      : undefined;

  const assigned_to =
    typeof searchParams.assigned_to === "string" && searchParams.assigned_to.trim()
      ? searchParams.assigned_to.trim()
      : undefined;

  return { from, to, status, assigned_to };
}

export function buildPoliciesQueryString(
  filters: CanonicalPolicyFilters,
  options?: { page?: number; pageSize?: number },
) {
  const params = new URLSearchParams();
  if (filters.from) params.set("expiring_after", filters.from);
  if (filters.to) params.set("expiring_before", filters.to);
  if (filters.status) params.set("status", filters.status);
  if (filters.assigned_to) params.set("assigned_to", filters.assigned_to);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("page_size", String(options.pageSize));

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function buildRenewalsSnapshotQueryString(filters: CanonicalPolicyFilters) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.status && RENEWAL_STATUS_SET.has(filters.status)) {
    params.set("status", filters.status);
  }
  if (filters.assigned_to) params.set("assigned_to", filters.assigned_to);
  const query = params.toString();
  return query ? `?${query}` : "";
}
