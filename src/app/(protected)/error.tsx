'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[page error]', error)
  }, [error])

  return (
    <div className="p-6 max-w-xl">
      <h2 className="text-xl font-bold text-red-600 mb-3">페이지 오류 발생</h2>
      <div className="bg-red-50 border border-red-200 rounded p-4 mb-4">
        <p className="font-mono text-sm text-red-800 whitespace-pre-wrap">
          {error.message || '알 수 없는 오류'}
        </p>
        {error.digest && (
          <p className="text-xs text-red-500 mt-2">digest: {error.digest}</p>
        )}
      </div>
      <div className="space-y-2 text-sm text-gray-600">
        <p className="font-medium">확인 사항:</p>
        <ol className="list-decimal ml-4 space-y-1">
          <li>Supabase 대시보드 → SQL Editor에서 <code className="bg-gray-100 px-1 rounded">supabase/migrations/001_initial.sql</code> 실행 여부</li>
          <li>로그인 상태 확인 (세션 만료 시 재로그인)</li>
          <li>브라우저 콘솔 및 터미널 로그 확인</li>
        </ol>
      </div>
      <button
        onClick={reset}
        className="mt-4 btn-primary"
      >
        다시 시도
      </button>
    </div>
  )
}
