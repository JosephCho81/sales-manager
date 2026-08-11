'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { login, type LoginState } from './actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary w-full justify-center flex" disabled={pending}>
      {pending ? '로그인 중...' : '로그인'}
    </button>
  )
}

export default function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, null)

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">아이디</label>
        <input
          id="username"
          name="username"
          type="text"
          className="input"
          placeholder="kim / choi / cho"
          required
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{state.error}</p>
      )}

      <SubmitButton />

      <p className="text-xs text-gray-400 text-center pt-1">
        로그인 상태는 이 기기에 유지됩니다. 공용 PC에서는 사용 후 로그아웃하세요.
      </p>
    </form>
  )
}
