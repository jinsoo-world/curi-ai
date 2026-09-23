// 드라이브・노션 동기화(갈래 G)의 순수 판정 함수들 — 인터넷・DB 없이 확인한다.
import { describe, it, expect } from 'vitest'
import { isChangedSince, cleanCloudProvider } from '../cloudsync'

describe('isChangedSince — 수정시각 비교(새 것만 판정)', () => {
    it('커서(마지막 동기화 시각)가 없으면 처음이라 항상 바뀐 것으로 본다', () => {
        expect(isChangedSince('2026-09-01T00:00:00Z', null)).toBe(true)
        expect(isChangedSince(null, null)).toBe(true)
    })

    it('수정시각이 커서보다 뒤(더 최근)면 바뀐 것', () => {
        expect(isChangedSince('2026-09-10T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(true)
    })

    it('수정시각이 커서와 같거나 이전이면 안 바뀐 것', () => {
        expect(isChangedSince('2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(false)
        expect(isChangedSince('2026-08-01T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(false)
    })

    it('시각이 없거나 모양이 이상하면 안전하게 「바뀌었다」로 본다(놓치는 것보다 중복이 낫다)', () => {
        expect(isChangedSince(undefined, '2026-09-01T00:00:00Z')).toBe(true)
        expect(isChangedSince('이상한 값', '2026-09-01T00:00:00Z')).toBe(true)
        expect(isChangedSince('2026-09-10T00:00:00Z', '이상한 커서')).toBe(true)
    })
})

describe('cleanCloudProvider', () => {
    it('구글 드라이브, 노션만 받는다', () => {
        expect(cleanCloudProvider('google_drive')).toBe('google_drive')
        expect(cleanCloudProvider('notion')).toBe('notion')
    })
    it('그 밖엔 전부 null(다른 공급자 이름을 적어 보내도 안 통한다)', () => {
        expect(cleanCloudProvider('slack')).toBeNull()
        expect(cleanCloudProvider('')).toBeNull()
        expect(cleanCloudProvider(undefined)).toBeNull()
        expect(cleanCloudProvider(123)).toBeNull()
    })
})
