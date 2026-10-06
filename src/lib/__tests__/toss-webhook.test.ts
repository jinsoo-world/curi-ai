import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyTossSignature } from '../toss-webhook'

const body = '{"eventType":"payout.changed","data":{}}'
const time = '2026-10-06T10:00:00+09:00'
const sig = (secret: string, b = body, t = time) => `v1:${createHmac('sha256', secret).update(`${b}:${t}`).digest('base64')}`

describe('토스 웹훅 서명 확인', () => {
    it('보안 키로 만든 서명이면 통과', () => {
        expect(verifyTossSignature(body, sig('k'), time, 'k')).toBe(true)
    })
    it('여러 서명 중 하나만 맞아도 통과(키 교체 중)', () => {
        expect(verifyTossSignature(body, `${sig('old')},${sig('k')}`, time, 'k')).toBe(true)
    })
    it('본문·시각·키가 하나라도 다르면 거절', () => {
        expect(verifyTossSignature(body + ' ', sig('k'), time, 'k')).toBe(false)
        expect(verifyTossSignature(body, sig('k'), '2026-10-06T10:00:01+09:00', 'k')).toBe(false)
        expect(verifyTossSignature(body, sig('other'), time, 'k')).toBe(false)
    })
    it('머리글·키가 없으면 거절', () => {
        expect(verifyTossSignature(body, null, time, 'k')).toBe(false)
        expect(verifyTossSignature(body, sig('k'), null, 'k')).toBe(false)
        expect(verifyTossSignature(body, sig('k'), time, undefined)).toBe(false)
        expect(verifyTossSignature(body, 'v1:###', time, 'k')).toBe(false)
    })
})
