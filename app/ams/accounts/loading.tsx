export default function CustomersLoadingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Customers</h1>
        <p className="text-sm text-zinc-500">Loading customers...</p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="h-10 animate-pulse rounded bg-zinc-100" />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="space-y-3">
          <div className="h-4 animate-pulse rounded bg-zinc-100" />
          <div className="h-4 animate-pulse rounded bg-zinc-100" />
          <div className="h-4 animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}
