import { describe, it, expect } from 'vitest'
import {
    hashAddress, signUnsubscribe, splitConsent, suppressionApplies, verifyBackfill, verifyUnsubscribe, SUPPRESSION_SCOPE,
} from '../consent'
import type { SuppressionRow } from '../consent'

describe('채널별 광고 동의 — 옮겨 담기', () => {
    it('옛 칸이 참이면 네 칸 모두 참, 거짓·비어 있음은 모두 거짓', () => {
        expect(splitConsent(true)).toEqual({ app_push: true, web_push: true, email: true, sms: true })
        expect(splitConsent(false)).toEqual({ app_push: false, web_push: false, email: false, sms: false })
        expect(splitConsent(null)).toEqual({ app_push: false, web_push: false, email: false, sms: false })
        expect(splitConsent(undefined)).toEqual({ app_push: false, web_push: false, email: false, sms: false })
    })

    it('옮기기 전 인원 = 각 칸 인원이고 어긋난 사람이 0명이면 맞다', () => {
        const r = verifyBackfill({ before: 120, after: { app_push: 120, web_push: 120, email: 120, sms: 120 }, mismatched: 0 })
        expect(r).toEqual({ ok: true, problems: [] })
    })

    it('한 칸이라도 인원이 다르면 틀렸다고 한다 (9/29 큐리어스 사고 = 문자·메일 칸이 비었다)', () => {
        const r = verifyBackfill({ before: 23777, after: { app_push: 23777, web_push: 23777, email: 0, sms: 0 }, mismatched: 23777 })
        expect(r.ok).toBe(false)
        expect(r.problems).toHaveLength(3)
        expect(r.problems[0]).toContain('email')
    })

    it('0명이어도 같으면 맞다', () => {
        expect(verifyBackfill({ before: 0, after: { app_push: 0, web_push: 0, email: 0, sms: 0 }, mismatched: 0 }).ok).toBe(true)
    })
})

describe('받지 않을 사람 명단 — 지문', () => {
    it('이메일은 대소문자·앞뒤 빈칸을 무시한다', () => {
        expect(hashAddress('email', ' Jin@Mission-Driven.kr ')).toBe(hashAddress('email', 'jin@mission-driven.kr'))
    })
    it('전화는 숫자만, +82 는 0 으로', () => {
        expect(hashAddress('phone', '010-1234-5678')).toBe(hashAddress('phone', '01012345678'))
        expect(hashAddress('phone', '+82 10 1234 5678')).toBe(hashAddress('phone', '01012345678'))
    })
    it('종류가 다르면 같은 글자라도 지문이 다르다', () => {
        expect(hashAddress('user', 'abc')).not.toBe(hashAddress('email', 'abc'))
    })
    it('지문은 원문을 담지 않는다', () => {
        expect(hashAddress('email', 'jin@mission-driven.kr')).toMatch(/^[0-9a-f]{64}$/)
    })
})

describe('받지 않을 사람 명단 — 막는 범위', () => {
    const row = (reason: SuppressionRow['reason'], created_at = '2026-10-01T00:00:00Z'): SuppressionRow => ({ channel: 'email', reason, scope: SUPPRESSION_SCOPE[reason], created_at })

    it('반송·스팸신고·결번은 정보도 광고도 막는다', () => {
        for (const r of ['bounce', 'complaint', 'dead_number'] as const) {
            expect(suppressionApplies([row(r)], 'info', null)).toBe(r)
            expect(suppressionApplies([row(r)], 'ad', null)).toBe(r)
        }
    })
    it('수신 거부·탈퇴는 광고만 막는다', () => {
        for (const r of ['unsubscribe', 'deleted_account'] as const) {
            expect(suppressionApplies([row(r)], 'info', null)).toBeNull()
            expect(suppressionApplies([row(r)], 'ad', null)).toBe(r)
        }
    })
    it('수신 거부 뒤에 본인이 다시 동의했으면 광고를 막지 않는다', () => {
        expect(suppressionApplies([row('unsubscribe', '2026-10-01T00:00:00Z')], 'ad', '2026-10-02T00:00:00Z')).toBeNull()
        expect(suppressionApplies([row('unsubscribe', '2026-10-03T00:00:00Z')], 'ad', '2026-10-02T00:00:00Z')).toBe('unsubscribe')
    })
    it('다시 동의해도 반송은 계속 막는다', () => {
        expect(suppressionApplies([row('bounce', '2026-09-01T00:00:00Z')], 'ad', '2026-10-02T00:00:00Z')).toBe('bounce')
    })
    it('명단이 비면 막지 않는다', () => {
        expect(suppressionApplies([], 'ad', null)).toBeNull()
    })
})

describe('로그인 없는 수신 거부 서명', () => {
    const SECRET = 'x'.repeat(24)
    const UID = '0f8fad5b-d9cb-469f-a165-70867728950e'

    it('서명한 것은 그대로 풀린다', () => {
        const t = signUnsubscribe(UID, 'email', SECRET)
        expect(verifyUnsubscribe(t, SECRET)).toEqual({ userId: UID, target: 'email' })
    })
    it('다른 열쇠로는 안 풀린다', () => {
        expect(verifyUnsubscribe(signUnsubscribe(UID, 'email', SECRET), 'other-secret-0123456789')).toBeNull()
    })
    it('내용을 바꾸면(다른 사람·다른 채널) 안 풀린다', () => {
        const [, sig] = signUnsubscribe(UID, 'email', SECRET).split('.')
        const forged = Buffer.from(JSON.stringify({ u: '11111111-1111-1111-1111-111111111111', c: 'email', v: 1 })).toString('base64url')
        expect(verifyUnsubscribe(`${forged}.${sig}`, SECRET)).toBeNull()
    })
    it('모양이 이상하면 null', () => {
        for (const t of ['', 'abc', 'a.b.c', null, undefined, 'x'.repeat(700)]) expect(verifyUnsubscribe(t as string, SECRET)).toBeNull()
    })
})
