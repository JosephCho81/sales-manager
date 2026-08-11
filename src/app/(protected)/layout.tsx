import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { RoleProvider } from '@/components/RoleProvider'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'
import MobileTopBar from '@/components/MobileTopBar'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // proxy가 먼저 걸러내지만, 미들웨어를 우회하는 경로(직접 RSC 호출 등)를 위한 2차 가드.
  // 역할이 없는 계정(user_roles 미등록)도 여기서 막힌다 — 기본 거부.
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <RoleProvider canEdit={session.canEdit}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar displayName={session.displayName} canEdit={session.canEdit} />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <MobileTopBar displayName={session.displayName} canEdit={session.canEdit} />
          <div className="p-3 pb-20 md:p-6 md:pb-6">{children}</div>
        </main>
        <BottomNav />
      </div>
    </RoleProvider>
  )
}
