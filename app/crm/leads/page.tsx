import { InlineError } from "@/app/ams/_components/InlineError";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { LeadsWorkspace } from "@/app/crm/_components/LeadsWorkspace";
import { buildCrmQuery, requireSession, safeApiFetchJson } from "@/app/crm/_lib/api";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  assigned_producer_id: string | null;
  assigned_producer_display_name?: string | null;
  assignment_status: string;
  lead_list_id: string | null;
  lead_list_name?: string | null;
  created_at: string;
  updated_at: string;
};

type Producer = {
  id: string;
  display_name: string;
  role: string;
};

type Pipeline = {
  id: string;
  name: string;
};

function firstString(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

type LeadFilters = {
  view: "all" | "mine" | "unassigned";
  q?: string;
  source?: string;
  status?: string;
  assignment_status?: string;
  assigned_producer_id?: string;
};

export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const resolvedSearch = await searchParams;
  const filters: LeadFilters = {
    view:
      firstString(resolvedSearch.view) === "mine" || firstString(resolvedSearch.view) === "unassigned"
        ? (firstString(resolvedSearch.view) as "mine" | "unassigned")
        : "all",
    q: firstString(resolvedSearch.q),
    source: firstString(resolvedSearch.source),
    status: firstString(resolvedSearch.status),
    assignment_status: firstString(resolvedSearch.assignment_status),
    assigned_producer_id: firstString(resolvedSearch.assigned_producer_id),
  };

  const [leadsRes, usersRes, pipelinesRes] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Lead[] }>(
      `/api/crm/leads${buildCrmQuery({
        view: filters.view,
        q: filters.q,
        source: filters.source,
        status: filters.status,
        assignment_status: filters.assignment_status,
        assigned_producer_id: filters.assigned_producer_id,
        page_size: "100",
      })}`,
    ),
    safeApiFetchJson<{ ok: true; data: Producer[] }>("/api/users"),
    safeApiFetchJson<{ ok: true; data: Pipeline[] }>("/api/crm/pipelines?page_size=100"),
  ]);

  const retryHref = `/crm/leads${buildCrmQuery({
    view: filters.view,
    q: filters.q,
    source: filters.source,
    status: filters.status,
    assignment_status: filters.assignment_status,
    assigned_producer_id: filters.assigned_producer_id,
  })}`;

  if (!leadsRes.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Leads"
          description="Assign, import, and convert leads into revenue-first deals."
        />
        <InlineError
          title="Couldn’t load leads."
          details={`Status ${leadsRes.status || 500}: ${leadsRes.errorMessage}`}
          retryHref={retryHref}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Import lead lists, keep assignment optional, and convert cleanly into customer-linked deals."
      />
      {!usersRes.ok ? (
        <InlineError
          title="Couldn’t load producers."
          details={`Status ${usersRes.status || 500}: ${usersRes.errorMessage}`}
          retryHref={retryHref}
        />
      ) : null}
      {!pipelinesRes.ok ? (
        <InlineError
          title="Couldn’t load pipelines."
          details={`Status ${pipelinesRes.status || 500}: ${pipelinesRes.errorMessage}`}
          retryHref={retryHref}
        />
      ) : null}
      <LeadsWorkspace
        filters={filters}
        leads={leadsRes.data.data}
        pipelines={pipelinesRes.ok ? pipelinesRes.data.data : []}
        producers={usersRes.ok ? usersRes.data.data : []}
      />
    </div>
  );
}
