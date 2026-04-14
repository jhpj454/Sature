export default function CustomersLoadingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Customers</h1>
        <p className="text-sm text-slate-400">Loading customers...</p>
      </div>

      <div className="rounded-lg border border-slate-200/30 bg-white p-4">
        <div className="h-10 animate-pulse rounded bg-white/30" />
      </div>

      <div className="rounded-lg border border-slate-200/30 bg-white p-4">
        <div className="space-y-3">
          <div className="h-4 animate-pulse rounded bg-white/30" />
          <div className="h-4 animate-pulse rounded bg-white/30" />
          <div className="h-4 animate-pulse rounded bg-white/30" />
        </div>
      </div>
    </div>
  );
}
