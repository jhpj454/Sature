import { safeApiFetchJson, requireSession } from "@/app/crm/_lib/api";
import { CustomersTable } from "./_components/CustomersTable";

export type Customer = {
  id: string;
  account_name: string;
  account_type: "commercial" | "personal";
  status: "prospect" | "client" | "lost";
  assigned_producer_id: string | null;
  producer_display_name: string | null;
  primary_contact_first_name: string | null;
  primary_contact_last_name: string | null;
  primary_contact_email: string | null;
  active_policy_count: string | number;
  next_renewal_date: string | null;
  created_at: string;
};

export type UpcomingRenewal = {
  account_id: string;
  account_name: string;
  policy_id: string;
  policy_number: string | null;
  lob: string | null;
  expiration_date: string;
};

export default async function CrmCustomersPage() {
  await requireSession();

  const [customersRes, renewalsRes] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: Customer[] }>("/api/crm/customers?page_size=100"),
    safeApiFetchJson<{ ok: true; data: UpcomingRenewal[] }>(
      "/api/crm/customers?view=renewals",
    ),
  ]);

  const customers = customersRes.ok ? customersRes.data.data : [];
  const renewals = renewalsRes.ok ? renewalsRes.data.data : [];

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1
          style={{
            fontFamily: "var(--font-lora)",
            fontSize: "3.5rem",
            color: "hsl(0,0%,100%)",
            margin: 0,
          }}
        >
          Customers
        </h1>
      </div>

      {!customersRes.ok && (
        <div
          style={{
            background: "rgba(61,13,13,0.7)",
            border: "1px solid rgba(224,82,82,0.3)",
            borderRadius: 12,
            padding: "16px 20px",
            color: "#e05252",
            fontFamily: "var(--font-instrument-sans)",
            fontSize: 14,
          }}
        >
          Unable to load customers: {customersRes.errorMessage}
        </div>
      )}

      {/* Upcoming Renewals Panel */}
      {renewals.length > 0 && (
        <div
          style={{
            background: "rgba(30,35,50,0.70)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,200,80,0.15)",
            borderRadius: 16,
            padding: "20px 24px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-lora)",
                fontSize: 18,
                color: "hsl(0,0%,100%)",
              }}
            >
              Upcoming Renewals
            </span>
            <span
              style={{
                background: "rgba(245,197,66,0.15)",
                color: "#f5c542",
                borderRadius: 6,
                padding: "2px 9px",
                fontSize: 12,
                fontFamily: "var(--font-instrument-sans)",
                fontWeight: 500,
              }}
            >
              {renewals.length} within 60 days
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {renewals.map((r) => (
              <a
                key={r.policy_id}
                href={`/crm/customers/${r.account_id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  textDecoration: "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "rgba(255,255,255,0.06)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "rgba(255,255,255,0.03)";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-lora)",
                      fontSize: 14,
                      color: "hsl(0,0%,100%)",
                    }}
                  >
                    {r.account_name}
                  </span>
                  {r.lob && (
                    <span
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        color: "hsl(0,0%,70%)",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: 11,
                        fontFamily: "var(--font-instrument-sans)",
                      }}
                    >
                      {r.lob}
                    </span>
                  )}
                  {r.policy_number && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "hsl(0,0%,50%)",
                        fontFamily: "var(--font-instrument-sans)",
                      }}
                    >
                      {r.policy_number}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 12,
                    color: "#f5c542",
                    fontFamily: "var(--font-instrument-sans)",
                    fontWeight: 500,
                  }}
                >
                  {new Date(r.expiration_date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <CustomersTable customers={customers} />
    </div>
  );
}
