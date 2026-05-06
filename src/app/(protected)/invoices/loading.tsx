export default function InvoicesLoading() {
  return (
    <div>
      <div className="mb-6">
        <div className="h-7 w-44 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-4 w-56 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="h-9 w-48 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[0, 1, 2].map(i => (
          <div key={i} className="card p-4 h-24 animate-pulse bg-gray-50" />
        ))}
      </div>
      <div className="card h-64 animate-pulse bg-gray-50" />
    </div>
  )
}
