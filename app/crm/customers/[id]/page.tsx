import Link from "next/link";
import { notFound } from "next/navigation";
import { safeApiFetchJson } from "@/app/crm/_lib/api";
import { CustomerDetailClient } from "./CustomerDetailClient";

export type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string;
  status: string;
  created_at: string;
};

export type Policy = {
  id: string;
  policy_number: string | null;
  lob: string | null;
  expiration_date: string | null;
  premium_amount: string | number | null;
  status: string;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "completed";
  due_date: string | null;
  assigned_to_user_id: string | null;
  assigned_to_display_name: string | null;
  created_at: string;
};

export type AccountDetail = {
  id: string;
  account_name: string;
  account_type: "commercial" | "personal";
  status: "prospect" | "client" | "lost";
  assigned_producer_id: string | null;
  assigned_csr_id: string | null;
  industry_segment: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  producer_display_name: string | null;
  csr_display_name: string | null;
};

type CustomerDetailResponse = {
  account: AccountDetail;
  contacts: Contact[];
  policies: Policy[];
  tasks: Task[];
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const detailRes = await safeApiFetchJson<{ ok: true; data: CustomerDetailResponse }>(
    `/api/crm/customers/${id}`,
  );

  if (!detailRes.ok) {
    if (detailRes.status === 404) notFound();
    return (
      <div
        style={{
          padding: "48px 24px",
          fontFamily: "var(--font-instrument-sans)",
          fontSize: 14,
          color: "#e05252",
        }}
      >
        Unable to load customer: {detailRes.errorMessage}
        <Link
          href="/crm/customers"
          style={{ display: "block", marginTop: 12, color: "#5a9ff5" }}
        >
          Back to Customers
        </Link>
      </div>
    );
  }

  const { account, contacts, policies, tasks } = detailRes.data.data;
  if (!account) notFound();

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Link
              href="/crm/customers"
              style={{
                fontFamily: "var(--font-instrument-sans)",
                fontSize: 13,
                color: "#5a9ff5",
                textDecoration: "none",
              }}
            >
              ← Customers
            </Link>
          </div>
          <h1
            style={{
              fontFamily: "var(--font-lora)",
              fontSize: "2.5rem",
              color: "hsl(0,0%,100%)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {account.account_name}
          </h1>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            {/* Type badge */}
            <span
              style={{
                display: "inline-block",
                background: account.account_type === "commercial" ? "#1a3a6b" : "#0d3d2a",
                color: account.account_type === "commercial" ? "#5a9ff5" : "#4caf7d",
                borderRadius: 6,
                padding: "3px 10px",
                fontSize: 12,
                fontFamily: "var(--font-instrument-sans)",
                fontWeight: 500,
                textTransform: "capitalize",
              }}
            >
              {account.account_type}
            </span>
            {/* Status badge */}
            <span
              style={{
                display: "inline-block",
                background:
                  account.status === "client"
                    ? "#0d3d2a"
                    : account.status === "prospect"
                    ? "#3d2e00"
                    : "#3d0d0d",
                color:
                  account.status === "client"
                    ? "#4caf7d"
                    : account.status === "prospect"
                    ? "#f5c542"
                    : "#e05252",
                borderRadius: 6,
                padding: "3px 10px",
                fontSize: 12,
                fontFamily: "var(--font-instrument-sans)",
                fontWeight: 500,
                textTransform: "capitalize",
              }}
            >
              {account.status}
            </span>
            {account.producer_display_name && (
              <span
                style={{
                  fontFamily: "var(--font-instrument-sans)",
                  fontSize: 13,
                  color: "hsl(0,0%,50%)",
                }}
              >
                Producer: {account.producer_display_name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs + content */}
      <CustomerDetailClient
        account={account}
        contacts={contacts}
        policies={policies}
        tasks={tasks}
      />
    </div>
  );
}
