import { describe, it, expect, beforeEach } from 'vitest'
import { signGrant, verifyGrant, GRANT_TEXT_MAX } from '../grant'
import { answerToChunks, normalizeForMatch } from '../chunks'

beforeEach(() => { process.env.SUPABASE_SERVICE_ROLE_KEY = 'k' })

describe('읽기표 도장', () => {
    it('같은 글·사람·봇이면 통과', () => {
        const g = signGrant('u', 'm', '안녕')!
        expect(verifyGrant('u', 'm', { text: '안녕', ...g })).toBe(true)
    })
    it('글·사람·봇·시각이 바뀌면 실패', () => {
        const g = signGrant('u', 'm', '안녕')!
        expect(verifyGrant('u', 'm', { text: '안녕!', ...g })).toBe(false)
        expect(verifyGrant('x', 'm', { text: '안녕', ...g })).toBe(false)
        expect(verifyGrant('u', 'y', { text: '안녕', ...g })).toBe(false)
        expect(verifyGrant('u', 'm', { text: '안녕', ts: g.ts + 1, sig: g.sig })).toBe(false)
    })
    it('열쇠가 없으면 도장을 안 찍는다', () => {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.CRON_SECRET
        expect(signGrant('u', 'm', '안녕')).toBeNull()
    })
    it('너무 긴 글은 도장 없음', () => {
        expect(signGrant('u', 'm', 'a'.repeat(GRANT_TEXT_MAX + 1))).toBeNull()
    })
})

describe('읽을 조각', () => {
    it('마크다운을 벗기고 500자 이하 조각으로 나눈다', () => {
        const chunks = answerToChunks('## 제목\n**안녕하세요.** ' + '가나다라마바사아자차카타파하다. '.repeat(60))
        expect(chunks.length).toBeGreaterThan(1)
        expect(chunks.every(c => c.length <= 500 && !c.includes('**') && !c.includes('#'))).toBe(true)
    })
    it('빈 글은 조각 없음', () => { expect(answerToChunks('```code```')).toEqual([]) })
    it('공백 차이는 무시하고 비교', () => { expect(normalizeForMatch(' a \n b ')).toBe('a b') })
})
