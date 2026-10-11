export default function FeeWaiverLoading() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="space-y-5 rounded-xl border bg-white p-8 shadow-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
            <div className="h-9 animate-pulse rounded-lg bg-gray-100" />
          </div>
        ))}
        <div className="h-10 animate-pulse rounded-lg bg-gray-200" />
      </div>
    </div>
  );
}
