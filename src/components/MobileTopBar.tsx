import { logout } from '@/lib/auth-actions'

/** 모바일 전용 상단바 — 사이드바가 숨겨지는 화면에서 계정·로그아웃 노출 */
export default function MobileTopBar({ displayName, canEdit }: { displayName: string; canEdit: boolean }) {
  return (
    <div className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-2 bg-white border-b border-gray-200 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-gray-900 truncate">{displayName}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          canEdit ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          {canEdit ? '편집' : '조회'}
        </span>
      </div>
      <form action={logout}>
        <button type="submit" className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1">
          로그아웃
        </button>
      </form>
    </div>
  )
}
