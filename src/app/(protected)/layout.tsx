// [로그인 비활성화] 추후 활성화 시 아래 주석 해제 후 인증 코드 복원
// import { redirect } from 'next/navigation'
// import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/Sidebar'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // [로그인 비활성화] 추후 활성화 시 아래 블록 복원
  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  // if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
