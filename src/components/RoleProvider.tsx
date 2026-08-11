'use client'

import { createContext, useContext } from 'react'

/**
 * 편집 권한을 클라이언트 트리에 내려주는 컨텍스트.
 * UI 숨김은 어디까지나 편의 — 실제 권한 경계는 서버 액션의 requireOwner다.
 */
const CanEditContext = createContext(false)

export function RoleProvider({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) {
  return <CanEditContext.Provider value={canEdit}>{children}</CanEditContext.Provider>
}

/** owner면 true, 조회 전용(viewer)이면 false */
export function useCanEdit(): boolean {
  return useContext(CanEditContext)
}
