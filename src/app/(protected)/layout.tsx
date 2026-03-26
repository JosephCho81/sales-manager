import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let userEmail = ''

  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      redirect('/login')
    }

    userEmail = user.email ?? ''
  } catch (e) {
    // createClient 자체가 실패하면 (쿠키 컨텍스트 없음 등) 로그인으로
    console.error('[layout] auth error:', e)
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userEmail={userEmail} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
