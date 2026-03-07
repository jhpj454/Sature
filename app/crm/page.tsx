import Link from "next/link";
import { PageHeader } from "@/app/ams/_components/PageHeader";
import { Button } from "@/app/components/ui/button";

export default async function CrmDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM Dashboard"
        description="Producer workspace for lead follow-up, deal movement, and daily sales action."
        actions={
          <Link href="/crm/win-deals">
            <Button size="sm">Open Win Deals</Button>
          </Link>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Leads To Contact</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">--</p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Deals Ready To Close</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">--</p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Today&apos;s Activity</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">--</p>
        </article>
      </section>
    </div>
  );
}
