export default function FetchErrorView({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-red-600 mb-2">데이터 로드 오류</h2>
      <div className="bg-red-50 border border-red-200 rounded p-3 font-mono text-xs text-red-800 mb-2">
        {message}
      </div>
      {hint && <p className="text-sm text-gray-500">{hint}</p>}
    </div>
  )
}
