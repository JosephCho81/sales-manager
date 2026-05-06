export default function AnalyticsLoading() {
  return (
    <div>
      <div className="mb-2">
        <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="h-10 w-full bg-gray-100 rounded mb-4 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-4 h-36 animate-pulse bg-gray-50" />
        ))}
      </div>
      <div className="card h-64 animate-pulse bg-gray-50 mb-6" />
      <div className="card h-48 animate-pulse bg-gray-50" />
    </div>
  )
}
