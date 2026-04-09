/** unknown catch 값을 문자열 메시지로 변환 */
export function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
