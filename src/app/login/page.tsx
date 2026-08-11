import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  // 이미 로그인된 세션이면 로그인 화면을 다시 보여주지 않는다
  if (await getSession()) redirect('/analytics')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">판매관리 시스템</h1>
            <p className="mt-1 text-sm text-gray-500">(주)한국에이원 / 금화 / (주)나성</p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  )
}
