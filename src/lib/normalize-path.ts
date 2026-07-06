/**
 * 메신저 전달 과정에서 변형된 URL 경로를 정규화한다.
 * - 보이지 않는 문자(zero-width space 등) 제거 — 복사/붙여넣기 시 딸려옴
 * - 꼬리 공백·구두점 제거 — 문장 끝에 붙인 링크가 마침표까지 링크로 인식되는 경우
 * - 소문자화 — iOS 키보드 자동 대문자(/Analytics)
 */
const INVISIBLE_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g
const TRAILING_JUNK = /[\s.,;:!?'")\]]+$/

export function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

export function normalizePathname(pathname: string): string {
  const cleaned = decodePathname(pathname)
    .replace(INVISIBLE_CHARS, '')
    .replace(TRAILING_JUNK, '')
    .toLowerCase()
  return cleaned === '' ? '/' : cleaned
}
