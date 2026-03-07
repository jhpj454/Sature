import type { ReactNode } from "react";
import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";
import { formatDateTime } from "@/app/ams/_lib/format";
import { InlineError } from "@/app/ams/_components/InlineError";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { StatusBadge } from "@/app/ams/_components/StatusBadge";
import { CustomerCreatePanel } from "@/app/ams/accounts/CustomerCreatePanel";
import { Input } from "@/app/components/ui/input";
import { Select } from "@/app/components/ui/select";

type CustomerRow = {
  id: string;
  account_type: "commercial" | "personal";
  account_name: string;
  status: "prospect" | "client" | "lost";
  assigned_producer_id: string | null;
  assigned_csr_id: string | null;
  updated_at: string;
};

type UserRow = {
  id: string;
  display_name: string;
  role: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

function getString(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

function buildQuery(searchText?: string, status?: string) {
  const params = new URLSearchParams();
  if (searchText) {
    params.set("q", searchText);
  }
  if (status) {
    params.set("status", status);
  }
  params.set("page_size", "100");
  const query = params.toString();
  return query ? `?${query}` : "";
}

function renderLinkedCell(href: string, content: ReactNode, muted = false) {
  return (
    <Link
      className={`block rounded px-2 py-1 -mx-2 -my-1 hover:bg-zinc-50 ${muted ? "text-zinc-600" : "text-zinc-900"}`}
      href={href}
    >
      {content}
    </Link>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolved = await searchParams;
  const searchText = getString(resolved, "q")?.trim() || "";
  const status = getString(resolved, "status")?.trim() || "";
  const query = buildQuery(searchText || undefined, status || undefined);

  const [customersRequest, usersRequest] = await Promise.all([
    safeApiFetchJson<{ ok: true; data: CustomerRow[] }>(`/api/accounts${query}`),
    safeApiFetchJson<{ ok: true; data: UserRow[] }>("/api/users"),
  ]);

  const users = usersRequest.ok ? usersRequest.data.data : [];
  const userById = new Map(users.map((user) => [user.id, user.display_name]));

  const actions = <CustomerCreatePanel users={users} />;

  if (!customersRequest.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          actions={actions}
          description="View and manage agency customers."
          title="Customers"
        />
        <InlineError
          details={`Status ${customersRequest.status}: ${customersRequest.errorMessage}`}
          retryHref="/ams/accounts"
          title="Couldn't load customers."
        />
      </div>
    );
  }

  const rows = Array.isArray(customersRequest.data.data) ? customersRequest.data.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        actions={actions}
        description="View and manage agency customers."
        title="Customers"
      />

      <form className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 md:grid-cols-4">
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-zinc-500">Search by customer name</span>
          <Input defaultValue={searchText} name="q" placeholder="Acme LLC" type="search" />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-zinc-500">Status</span>
          <Select defaultValue={status} name="status">
            <option value="">All</option>
            <option value="prospect">prospect</option>
            <option value="client">client</option>
            <option value="lost">lost</option>
          </Select>
        </label>

        <div className="flex items-end gap-2">
          <button
            className="rounded bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
            type="submit"
          >
            Apply
          </button>
          <Link className="rounded border border-zinc-300 px-3 py-2 text-sm" href="/ams/accounts">
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-100 text-left text-zinc-600">
            <tr>
              <th className="px-3 py-2">Customer Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assigned Producer</th>
              <th className="px-3 py-2">Assigned CSR</th>
              <th className="px-3 py-2">Updated At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = `/ams/accounts/${row.id}`;

              return (
                <tr className="border-t border-zinc-200" key={row.id}>
                  <td className="px-3 py-2">
                    {renderLinkedCell(href, row.account_name)}
                  </td>
                  <td className="px-3 py-2">
                    {renderLinkedCell(href, row.account_type, true)}
                  </td>
                  <td className="px-3 py-2">
                    {renderLinkedCell(href, <StatusBadge value={row.status} />)}
                  </td>
                  <td className="px-3 py-2">
                    {renderLinkedCell(
                      href,
                      row.assigned_producer_id
                        ? userById.get(row.assigned_producer_id) ?? row.assigned_producer_id.slice(0, 8)
                        : "-",
                      true,
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {renderLinkedCell(
                      href,
                      row.assigned_csr_id
                        ? userById.get(row.assigned_csr_id) ?? row.assigned_csr_id.slice(0, 8)
                        : "-",
                      true,
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {renderLinkedCell(href, formatDateTime(row.updated_at), true)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-zinc-500" colSpan={6}>
                  No customers matched the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
