import { describe, it, expect } from 'vitest'
import { normalizePathname } from '@/lib/normalize-path'

const ZWSP = String.fromCharCode(0x200b)
const ZWNJ = String.fromCharCode(0x200c)
const WORD_JOINER = String.fromCharCode(0x2060)
const BOM = String.fromCharCode(0xfeff)

describe('normalizePathname — 메신저 전달로 변형된 URL 교정', () => {
  it('정상 경로는 그대로 둔다', () => {
    expect(normalizePathname('/analytics')).toBe('/analytics')
    expect(normalizePathname('/')).toBe('/')
  })

  it('iOS 자동 대문자를 소문자로 교정한다', () => {
    expect(normalizePathname('/Analytics')).toBe('/analytics')
    expect(normalizePathname('/ANALYTICS')).toBe('/analytics')
  })

  it('문장 끝 구두점이 링크에 포함된 경우를 교정한다', () => {
    expect(normalizePathname('/analytics.')).toBe('/analytics')
    expect(normalizePathname('/analytics,')).toBe('/analytics')
    expect(normalizePathname('/analytics!?')).toBe('/analytics')
    expect(normalizePathname('/analytics)')).toBe('/analytics')
  })

  it('복사 시 딸려온 보이지 않는 문자를 제거한다', () => {
    expect(normalizePathname('/analytics' + ZWSP)).toBe('/analytics')
    expect(normalizePathname('/ana' + ZWNJ + 'lytics')).toBe('/analytics')
    expect(normalizePathname('/analytics' + BOM)).toBe('/analytics')
    expect(normalizePathname('/analytics' + WORD_JOINER)).toBe('/analytics')
  })

  it('꼬리 공백을 제거한다', () => {
    expect(normalizePathname('/analytics ')).toBe('/analytics')
    expect(normalizePathname('/analytics\t')).toBe('/analytics')
  })

  it('전부 지워지면 루트로 보낸다', () => {
    expect(normalizePathname(ZWSP)).toBe('/')
  })

  it('경로 세그먼트는 소문자화 외에는 변형하지 않는다', () => {
    expect(normalizePathname('/contracts/AL35B')).toBe('/contracts/al35b')
  })

  it('퍼센트 인코딩된 보이지 않는 문자·구두점도 교정한다', () => {
    expect(normalizePathname('/analytics%E2%80%8B')).toBe('/analytics')
    expect(normalizePathname('/Analytics%2E')).toBe('/analytics')
  })

  it('잘못된 퍼센트 인코딩은 디코딩 없이 처리한다', () => {
    expect(normalizePathname('/analytics%E2')).toBe('/analytics%e2')
  })

  it('정규화 결과는 멱등이다', () => {
    const once = normalizePathname('/Analytics%E2%80%8B.')
    expect(normalizePathname(once)).toBe(once)
    expect(once).toBe('/analytics')
  })
})
