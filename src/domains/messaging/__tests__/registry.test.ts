import { describe, it, expect } from 'vitest'
import { MESSAGE_TYPES, defaultOnTypes, effectiveOn, getTypeDef } from '../registry'
import { p001RoutineDone, p014PermissionPending, p025GroupReplied, p033Published, p034InReview, p035NeedsFix, p089CheckIn } from '@/domains/push/catalog'

describe('유형 장부', () => {
    it('처음부터 켜진 유형 = 운영에서 이미 나가던 것뿐', () => {
        expect(defaultOnTypes().sort()).toEqual([
            'AUTH_OTP', 'BOT_OUTBOUND', 'OWNER_NOTIFY', 'P001', 'P014', 'P025', 'P033', 'P034', 'P035', 'P042', 'P089', 'SUPPORT_NOTIFY', 'TEST',
        ].sort())
    })

    it('캠페인 유형과 아직 안 만든 1차 후보는 꺼진 채로 시작한다', () => {
        for (const t of ['CAMPAIGN_AD_PUSH', 'CAMPAIGN_AD_EMAIL', 'CAMPAIGN_INFO', 'P002', 'P058', 'P072', 'P073', 'P078', 'P092', 'P124']) {
            expect(getTypeDef(t)?.defaultOn).toBe(false)
        }
    })

    it('유형 번호는 겹치지 않는다', () => {
        const types = MESSAGE_TYPES.map(t => t.type)
        expect(new Set(types).size).toBe(types.length)
    })

    it('앱 푸시 문구 틀의 정보/광고 = 장부의 정보/광고 (한 곳에서만 정한다)', () => {
        const built = [
            p001RoutineDone({ userId: 'u', mentorId: 'm', routineTitle: 'x' }),
            p014PermissionPending({ userId: 'u', mentorId: null, summary: 'x' }),
            p025GroupReplied({ userId: 'u', channelId: 'c', botNames: [] }),
            p033Published({ userId: 'u', mentorId: 'm' }),
            p034InReview({ userId: 'u', mentorId: 'm' }),
            p035NeedsFix({ userId: 'u', mentorId: 'm', categories: [], checkKey: 'k' }),
            p089CheckIn({ userId: 'u', mentorId: null }),
        ]
        for (const p of built) {
            expect(getTypeDef(p.type)?.category, p.type).toBe(p.category)
            expect(getTypeDef(p.type)?.routes, p.type).toContain('app_push')
        }
    })

    it('표의 값이 기본값보다 앞선다. 끌 수 없는 유형(인증번호)은 늘 켬', () => {
        const p001 = getTypeDef('P001')!
        expect(effectiveOn(p001, null)).toBe(true)
        expect(effectiveOn(p001, false)).toBe(false)
        const otp = getTypeDef('AUTH_OTP')!
        expect(effectiveOn(otp, false)).toBe(true)
        expect(effectiveOn(getTypeDef('CAMPAIGN_INFO')!, true)).toBe(true)
    })

    it('광고 문자 유형은 장부에 없다(1차에 광고 문자는 보내지 않는다)', () => {
        expect(MESSAGE_TYPES.filter(t => t.category === 'ad' && t.routes.includes('sms'))).toEqual([])
    })
})
