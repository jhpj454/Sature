import Link from "next/link";
import { safeApiFetchJson } from "@/app/ams/_lib/api";

type DashboardData = {
  users: { active: number; total: number };
  policies: { active: number };
  accounts: { total: number };
};

const FALLBACK: DashboardData = { users: { active: 0, total: 0 }, policies: { active: 0 }, accounts: { total: 0 } };

export default async function AdminDashboardPage() {
  const res = await safeApiFetchJson<{ ok: true; data: DashboardData }>("/api/admin/dashboard");
  const stats = res.ok ? res.data.data : FALLBACK;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Agency overview and system management.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Link
          className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
          href="/admin/users"
        >
          <h2 className="text-sm font-medium text-zinc-500">Active Users</h2>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{stats.users.active}</p>
          <p className="mt-1 text-xs text-zinc-400">{stats.users.total} total · click to manage</p>
        </Link>

        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-500">Active Policies</h2>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{stats.policies.active}</p>
          <p className="mt-1 text-xs text-zinc-400">in force</p>
        </article>

        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-500">Accounts</h2>
          <p className="mt-2 text-3xl font-semibold text-zinc-900">{stats.accounts.total}</p>
          <p className="mt-1 text-xs text-zinc-400">total in book</p>
        </article>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-700">Quick links</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            href="/admin/users"
          >
            Manage users
          </Link>
          <Link
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            href="/admin/reports"
          >
            Reports
          </Link>
          <Link
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            href="/admin/settings"
          >
            Settings
          </Link>
        </div>
      </section>
    </div>
  );
}
