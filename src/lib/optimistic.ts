/**
 * 낙관적 잠금 — "내가 화면에 띄운 뒤 아무도 안 건드렸을 때만 저장한다".
 *
 * 사용법: update 쿼리에 `.eq('id', id).eq('updated_at', expectedUpdatedAt)`를 걸고,
 * 반환 행이 0개면 `STALE_WRITE_ERROR`를 돌려준다. 행이 0개인 이유는
 *   ① 그 사이 누가 수정해서 updated_at이 달라졌다  ② 행이 삭제됐다
 * 둘 중 하나이고, 어느 쪽이든 사용자는 새로고침 후 다시 봐야 한다.
 *
 * 단일 필드 토글(정산완료, 활성/비활성, 지불업체)에는 걸지 않는다 — 마지막 값이
 * 곧 의도인 연산이라 충돌 개념이 없다.
 */
export const STALE_WRITE_ERROR =
  '다른 사람이 먼저 수정했거나 삭제된 항목입니다. 새로고침 후 다시 시도하세요.'

/** 수정 대상 식별 — 낙관적 잠금을 쓰는 액션의 공통 입력 */
export type EditTarget = {
  id: string
  /** 화면에 표시된 시점의 updated_at */
  updatedAt: string
}
