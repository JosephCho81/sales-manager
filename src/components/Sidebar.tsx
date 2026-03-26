'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard',   label: '대시보드',         icon: '📊' },
  { href: '/deliveries',  label: '입고 입력',         icon: '📦' },
  { href: '/contracts',   label: '낙찰 단가 관리',    icon: '📋' },
  { href: '/invoices',    label: '계산서 발행 지시',  icon: '🧾' },
  { href: '/analytics',   label: '매출·마진 현황',    icon: '📈' },
  { href: '/hyundai',     label: '현대제철 AL30',     icon: '🏭' },
  { href: '/fesi',        label: '페로실리콘 (FeSi)', icon: '💱' },
  { href: '/products',    label: '품목 설정',         icon: '⚙️' },
]

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-gray-900 text-white flex flex-col">
      {/* 로고 */}
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-base font-bold leading-tight">판매관리 시스템</h1>
        <p className="text-xs text-gray-400 mt-0.5">한국에이원 · 금화 · 라성</p>
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

      {/* 사용자 / 로그아웃 */}
      <div className="px-4 py-4 border-t border-gray-700">
        <p className="text-xs text-gray-400 truncate mb-2">{userEmail}</p>
        <button
          onClick={handleLogout}
          className="w-full text-left text-xs text-gray-400 hover:text-white transition-colors"
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
