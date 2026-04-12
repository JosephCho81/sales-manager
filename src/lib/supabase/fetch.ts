/**
 * Supabase 쿼리 결과를 받아 에러 시 throw, 정상 시 data를 반환.
 * page.tsx에서 반복되는 try/if(error) 패턴을 줄이기 위한 헬퍼.
 *
 * 사용 예:
 *   const rows = await supabaseFetch(
 *     supabase.from('products').select('*').eq('is_active', true)
 *   )
 */
export async function supabaseFetch<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<T> {
  const res = await query
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as T
}
