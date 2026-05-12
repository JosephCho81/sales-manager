'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/analytics',  label: '분석',   icon: '📊' },
  { href: '/invoices',   label: '지급일정', icon: '🧾' },
  { href: '/commission', label: '커미션', icon: '💰' },
  { href: '/contracts',  label: '계약',   icon: '📋' },
  { href: '/expenses',   label: '비용',   icon: '🧮' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 md:hidden">
      <div className="flex">
        {tabs.map(tab => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                active ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
