export default function CustomerDetailLoadingPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="h-6 w-48 animate-pulse rounded bg-zinc-100" />
        <div className="mt-3 h-4 w-72 animate-pulse rounded bg-zinc-100" />
      </div>

      <div className="flex gap-2">
        <div className="h-9 w-24 animate-pulse rounded bg-zinc-100" />
        <div className="h-9 w-24 animate-pulse rounded bg-zinc-100" />
        <div className="h-9 w-24 animate-pulse rounded bg-zinc-100" />
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
