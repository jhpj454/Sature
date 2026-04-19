import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatCurrency, formatDate, formatDateTime } from "@/app/ams/_lib/format";
import { DetailHeader } from "@/app/ams/_components/DetailHeader";
import { InlineError } from "@/app/ams/_components/InlineError";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";
import { TimelineFeed } from "@/app/ams/_components/TimelineFeed";
import { ContactCreatePanel } from "@/app/ams/accounts/[id]/ContactCreatePanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Tabs } from "@/app/components/ui/tabs";

type RouteContext = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Customer = {
  id: string;
  account_type: "commercial" | "personal";
  account_name: string;
  status: "prospect" | "client" | "lost";
  assigned_producer_id: string | null;
  assigned_csr_id: string | null;
  industry_segment: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  display_name: string;
  role: string;
};

type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_contact_method: string | null;
  do_not_contact: boolean;
};

type PolicyRow = {
  id: string;
  policy_number: string;
  carrier_name: string | null;
  lob: string;
  status: string;
  effective_date: string;
  expiration_date: string;
  agency_revenue_estimate_amount: string | number | null;
};

type TimelineItem = {
  id: string;
  type: string;
  entity_id: string;
  summary: string;
  created_at: string;
  created_by: string | null;
};

type ServiceCaseListResponse = {
  ok: true;
  data: Array<{ id: string }>;
  pagination?: { total?: number };
};

const ALL_POLICY_STATUSES = "active,pending,quoted,canceled,expired";
const TABS = ["overview", "contacts", "policies", "activity"] as const;
type TabKey = (typeof TABS)[number];
const IS_DEV = process.env.NODE_ENV !== "production";

function getActiveTab(rawValue: string | undefined): TabKey {
  if (rawValue && (TABS as readonly string[]).includes(rawValue)) {
    return rawValue as TabKey;
  }

  return "overview";
}

function displayContactName(contact: ContactRow) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim();
  return name || "Unnamed contact";
}

function renderLinkedText(href: string, text: string) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        color: "hsl(0,0%,90%)",
        textDecoration: "none",
      }}
    >
      {text}
    </Link>
  );
}

export default async function CustomerDetailPage({ params, searchParams }: RouteContext) {
  const { id } = await params;
  const resolvedSearch = await searchParams;
  const activeTab = getActiveTab(typeof resolvedSearch.tab === "string" ? resolvedSearch.tab : undefined);

  const [customerRequest, usersRequest, contactsSummaryRequest, policiesSummaryRequest, casesSummaryRequest] =
    await Promise.all([
      safeApiFetchJson<{ ok: true; data: Customer }>(`/api/accounts/${id}`),
      safeApiFetchJson<{ ok: true; data: UserRow[] }>("/api/users"),
      safeApiFetchJson<{ ok: true; data: ContactRow[]; pagination?: { total?: number } }>(
        `/api/accounts/${id}/contacts?page_size=1`,
      ),
      safeApiFetchJson<{ ok: true; data: PolicyRow[]; pagination?: { total?: number } }>(
        `/api/ams/policies?account_id=${id}&status=${encodeURIComponent(ALL_POLICY_STATUSES)}&page_size=1`,
      ),
      safeApiFetchJson<ServiceCaseListResponse>(
        `/api/service-cases?account_id=${id}&page_size=1`,
      ),
    ]);

  if (!customerRequest.ok) {
    return (
      <InlineError
        details={`Status ${customerRequest.status}: ${customerRequest.errorMessage}`}
        retryHref="/ams/accounts"
        title="Couldn't load customer."
      />
    );
  }

  const customer = customerRequest.data.data;
  const users = usersRequest.ok ? usersRequest.data.data : [];
  const userById = new Map(users.map((user) => [user.id, user.display_name]));

  const contactsTotal = contactsSummaryRequest.ok
    ? Number(contactsSummaryRequest.data.pagination?.total ?? contactsSummaryRequest.data.data.length)
    : 0;
  const policiesTotal = policiesSummaryRequest.ok
    ? Number(policiesSummaryRequest.data.pagination?.total ?? policiesSummaryRequest.data.data.length)
    : 0;
  const casesTotal = casesSummaryRequest.ok
    ? Number(casesSummaryRequest.data.pagination?.total ?? casesSummaryRequest.data.data.length)
    : 0;

  const [contactsRequest, policiesRequest, activityRequest] = await Promise.all([
    activeTab === "contacts"
      ? safeApiFetchJson<{ ok: true; data: ContactRow[] }>(`/api/accounts/${id}/contacts?page_size=100`)
      : Promise.resolve(null),
    activeTab === "policies"
      ? safeApiFetchJson<{ ok: true; data: PolicyRow[] }>(
          `/api/ams/policies?account_id=${id}&status=${encodeURIComponent(ALL_POLICY_STATUSES)}&page_size=100`,
        )
      : Promise.resolve(null),
    activeTab === "activity"
      ? safeApiFetchJson<{ ok: true; data: TimelineItem[] }>(`/api/accounts/${id}/timeline`)
      : Promise.resolve(null),
  ]);

  const tabs = TABS.map((tab) => ({
    label: tab.charAt(0).toUpperCase() + tab.slice(1),
    href: `/ams/accounts/${id}?tab=${tab}`,
    value: tab,
  }));

  return (
    <div className="space-y-6">
      <DetailHeader
        actions={
          <Link
            href="/ams/accounts"
            style={{ fontSize: "13px", color: "hsl(0,0%,55%)", textDecoration: "none", fontFamily: "var(--font-instrument-sans, sans-serif)" }}
          >
            ← Back to Customers
          </Link>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={customer.status} />
            <span>Type: {customer.account_type}</span>
            <span>
              Assigned Producer:{" "}
              {customer.assigned_producer_id
                ? userById.get(customer.assigned_producer_id) ?? customer.assigned_producer_id.slice(0, 8)
                : "-"}
            </span>
            <span>
              Assigned CSR:{" "}
              {customer.assigned_csr_id
                ? userById.get(customer.assigned_csr_id) ?? customer.assigned_csr_id.slice(0, 8)
                : "-"}
            </span>
          </div>
        }
        subtitle={`${customer.account_type} customer`}
        title={customer.account_name}
      />

      <Tabs active={activeTab} items={tabs} />

      {activeTab === "overview" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>Contacts</CardTitle></CardHeader>
              <CardContent>
                <p style={{ fontSize: "1.75rem", fontWeight: 600, color: "hsl(0,0%,100%)" }}>{contactsTotal}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Policies</CardTitle></CardHeader>
              <CardContent>
                <p style={{ fontSize: "1.75rem", fontWeight: 600, color: "hsl(0,0%,100%)" }}>{policiesTotal}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Service Cases</CardTitle></CardHeader>
              <CardContent>
                <p style={{ fontSize: "1.75rem", fontWeight: 600, color: "hsl(0,0%,100%)" }}>{casesTotal}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm md:grid-cols-2">
              {[
                ["Customer Type", customer.account_type],
                ["Status", customer.status],
                ["Assigned Producer", customer.assigned_producer_id ? userById.get(customer.assigned_producer_id) ?? customer.assigned_producer_id.slice(0, 8) : "-"],
                ["Assigned CSR", customer.assigned_csr_id ? userById.get(customer.assigned_csr_id) ?? customer.assigned_csr_id.slice(0, 8) : "-"],
                ["Industry Segment", customer.industry_segment ?? "-"],
                ["Updated At", formatDateTime(customer.updated_at)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                  <span style={{ color: "hsl(0,0%,50%)" }}>{label}</span>
                  <span style={{ color: "hsl(0,0%,90%)" }}>{value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.notes ? (
                <p style={{ whiteSpace: "pre-wrap", fontSize: "13px", color: "hsl(0,0%,85%)" }}>{customer.notes}</p>
              ) : (
                <p style={{ fontSize: "13px", color: "hsl(0,0%,50%)" }}>No notes recorded for this customer.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "contacts" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ContactCreatePanel accountId={id} />
          </div>

          {!contactsRequest ? null : !contactsRequest.ok ? (
            <div className="space-y-3">
              <InlineError
                details={`Status ${contactsRequest.status}: ${contactsRequest.errorMessage}`}
                retryHref={`/ams/accounts/${id}?tab=contacts`}
                title="Couldn't load contacts."
              />
              {IS_DEV ? (
                <Card>
                  <CardHeader>
                    <CardTitle>DEV Diagnostics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-slate-700 dark:text-[#e8eaf0]">
                    <div>
                      <span className="font-medium text-slate-800 dark:text-[#e8eaf0]">Request:</span>{" "}
                      <code className="break-all">{contactsRequest.requestUrl}</code>
                    </div>
                    <div>
                      <span className="font-medium text-slate-800 dark:text-[#e8eaf0]">Response:</span>{" "}
                      {contactsRequest.status} {contactsRequest.errorMessage}
                    </div>
                    <pre className="overflow-x-auto rounded bg-white/30 dark:bg-white/[0.08] p-3 whitespace-pre-wrap">
                      {contactsRequest.responsePreview || "(empty response body)"}
                    </pre>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : (
            <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              <table style={{ minWidth: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                    {["Name","Email","Phone","Preferred Contact Method","Do Not Contact"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "hsl(0,0%,50%)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contactsRequest.data.data.map((contact) => (
                    <tr key={contact.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "hsl(0,0%,85%)" }}>
                      <td style={{ padding: "10px 14px" }}>{displayContactName(contact)}</td>
                      <td style={{ padding: "10px 14px" }}>{contact.email ?? "-"}</td>
                      <td style={{ padding: "10px 14px" }}>{contact.phone ?? "-"}</td>
                      <td style={{ padding: "10px 14px" }}>{contact.preferred_contact_method ?? "-"}</td>
                      <td style={{ padding: "10px 14px" }}>{contact.do_not_contact ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                  {contactsRequest.data.data.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "32px", textAlign: "center", color: "hsl(0,0%,50%)" }}>
                        No contacts found for this customer.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "policies" ? (
        !policiesRequest ? null : !policiesRequest.ok ? (
          <InlineError
            details={`Status ${policiesRequest.status}: ${policiesRequest.errorMessage}`}
            retryHref={`/ams/accounts/${id}?tab=policies`}
            title="Couldn't load policies."
          />
        ) : (
          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
            <table style={{ minWidth: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                  {["Policy Number","Carrier","LOB","Status","Effective Date","Expiration Date","Revenue Estimate"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "hsl(0,0%,50%)", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policiesRequest.data.data.map((policy) => {
                  const href = `/ams/policies/${policy.id}`;
                  return (
                    <tr key={policy.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "10px 14px" }}>{renderLinkedText(href, policy.policy_number)}</td>
                      <td style={{ padding: "10px 14px" }}>{renderLinkedText(href, policy.carrier_name ?? "-")}</td>
                      <td style={{ padding: "10px 14px" }}>{renderLinkedText(href, policy.lob)}</td>
                      <td style={{ padding: "10px 14px" }}>{renderLinkedText(href, policy.status)}</td>
                      <td style={{ padding: "10px 14px" }}>{renderLinkedText(href, formatDate(policy.effective_date))}</td>
                      <td style={{ padding: "10px 14px" }}>{renderLinkedText(href, formatDate(policy.expiration_date))}</td>
                      <td style={{ padding: "10px 14px" }}>{renderLinkedText(href, formatCurrency(policy.agency_revenue_estimate_amount))}</td>
                    </tr>
                  );
                })}
                {policiesRequest.data.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "32px", textAlign: "center", color: "hsl(0,0%,50%)" }}>
                      No policies found for this customer.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {activeTab === "activity" ? (
        !activityRequest ? null : !activityRequest.ok ? (
          <InlineError
            details={`Status ${activityRequest.status}: ${activityRequest.errorMessage}`}
            retryHref={`/ams/accounts/${id}?tab=activity`}
            title="Couldn't load activity."
          />
        ) : (
          <TimelineFeed items={activityRequest.data.data} />
        )
      ) : null}
    </div>
  );
}
