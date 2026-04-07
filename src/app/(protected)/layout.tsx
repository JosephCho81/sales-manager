import Sidebar from '@/components/Sidebar'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // TODO: 로그인 기능 임시 비활성화 — 테스트용
  const userEmail = ''

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userEmail={userEmail} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
