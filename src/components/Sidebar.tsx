'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/lib/auth-actions'

const navItems = [
  { href: '/analytics',   label: '매출·마진 현황',    icon: '📈' },
  { href: '/contracts',   label: '낙찰 단가 관리',    icon: '📋' },
  { href: '/deliveries',  label: '입고 입력',         icon: '📦' },
  { href: '/commission',  label: '커미션 관리',       icon: '💰' },
  { href: '/invoices',    label: '지급 일정 관리',    icon: '🧾' },
  { href: '/products',    label: '품목 설정',         icon: '⚙️' },
  { href: '/expenses',    label: '비용 정산',         icon: '🧮' },
]

export default function Sidebar({ displayName, canEdit }: { displayName: string; canEdit: boolean }) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex w-56 flex-shrink-0 bg-gray-900 text-white flex-col">
      {/* 로고 */}
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-base font-bold leading-tight">판매관리 시스템</h1>
        <p className="text-sm font-medium text-blue-300 mt-1.5 leading-snug">{displayName}</p>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-700">
        <div className="mb-2">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            canEdit ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}>
            {canEdit ? '편집 가능' : '조회 전용'}
          </span>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full text-left text-xs text-gray-400 hover:text-white transition-colors"
          >
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  )
}
