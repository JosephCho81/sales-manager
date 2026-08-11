import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  // 이미 로그인된 세션이면 로그인 화면을 다시 보여주지 않는다
  if (await getSession()) redirect('/analytics')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="card overflow-hidden">
          {/* 사이드바와 같은 gray-900 헤더 — 로그인 후 화면과 톤을 맞춘다 */}
          <div className="bg-gray-900 px-7 py-7 text-center text-white">
            <h1 className="text-lg font-bold leading-tight">판매관리 시스템</h1>
          </div>

          <div className="px-7 py-7">
            <LoginForm />
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-gray-400">
          계정 문의는 관리자에게 연락하세요.
        </p>
      </div>
    </div>
  )
}
