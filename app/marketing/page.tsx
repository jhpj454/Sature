export default async function MarketingDashboardPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Marketing Dashboard</h1>
        <p className="text-sm text-zinc-500">Role: marketing</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Campaign Performance</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">--</p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Automations Running</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">--</p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-medium text-zinc-700">Audience Growth</h2>
          <p className="mt-3 text-2xl font-semibold text-zinc-900">--</p>
        </article>
      </section>
    </div>
  );
}
