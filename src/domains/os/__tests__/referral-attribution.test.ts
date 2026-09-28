import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { findReferrer, attributeReferral, ensureOnboardingRow } from '../onboarding-server'
import { REFERRER_REWARD } from '@/domains/trial'

// 아주 작은 가짜 DB: users / user_onboarding 두 표, eq/is/maybeSingle/update/upsert 만 흉내낸다
type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>) {
    const from = (t: string) => {
        const filters: [string, 'eq' | 'is', unknown][] = []
        let op: { kind: 'select' } | { kind: 'update'; v: Row } = { kind: 'select' }
        const rows = () => (tables[t] ??= []).filter(r => filters.every(([k, m, v]) => (m === 'eq' ? r[k] === v : (r[k] ?? null) === v)))
        const q: Record<string, unknown> = {
            select: () => q,
            eq: (k: string, v: unknown) => { filters.push([k, 'eq', v]); return q },
            is: (k: string, v: unknown) => { filters.push([k, 'is', v]); return q },
            update: (v: Row) => { op = { kind: 'update', v }; return q },
            upsert: (v: Row) => { if (!(tables[t] ??= []).some(r => r.user_id === v.user_id)) tables[t].push({ ...v }); return Promise.resolve({ error: null }) },
            maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
            then: (res: (x: unknown) => void) => { if (op.kind === 'update') { const v = op.v; rows().forEach(r => Object.assign(r, v)) } res({ error: null }) },
        }
        return q
    }
    return { from } as never
}

const NEW = new Date().toISOString()

describe('추천 귀속', () => {
    it('소문자·공백 코드도 찾고, 자기 코드는 막는다', async () => {
        const db = fakeDb({ users: [{ id: 'A', referral_code: 'ABCD1234' }, { id: 'B' }] })
        expect((await findReferrer(db, 'B', ' abcd-1234 '))?.id).toBe('A')
        expect(await findReferrer(db, 'A', 'ABCD1234')).toBeNull()
        expect(await findReferrer(db, 'B', 'NOPE0000')).toBeNull()
    })

    it('users.referred_by 와 user_onboarding.referrer_id 를 채우고, 이미 있으면 덮지 않는다', async () => {
        const t = { users: [{ id: 'A', referral_code: 'ABCD1234' }, { id: 'C', referral_code: 'CCCC1111' }, { id: 'B', referred_by: null }], user_onboarding: [{ user_id: 'B', referrer_id: null }] }
        const db = fakeDb(t)
        expect((await attributeReferral(db, 'B', 'abcd1234', 'link')).ok).toBe(true)
        await attributeReferral(db, 'B', 'CCCC1111', 'code')
        expect(t.users[2].referred_by).toBe('ABCD1234')
        expect(t.user_onboarding[0]).toMatchObject({ referrer_id: 'A', referral_via: 'link', referral_code: 'ABCD1234' })
    })

    it('온보딩 행이 이미 있어도(첫 로그인 때 쿠키 없음) 나중 쿠키로 귀속한다', async () => {
        const t = { users: [{ id: 'A', referral_code: 'ABCD1234' }, { id: 'B', referred_by: null }], user_onboarding: [{ user_id: 'B', status: 'started', referrer_id: null }] }
        const db = fakeDb(t)
        const needs = await ensureOnboardingRow(db, { userId: 'B', authCreatedAt: NEW, refCookie: 'ABCD1234', termsAt: null, provider: null })
        expect(needs).toBe(true)
        expect(t.users[1].referred_by).toBe('ABCD1234')
        expect(t.user_onboarding[0].referrer_id).toBe('A')
    })

    it('새 가입자면 온보딩 행을 만들고 귀속한다', async () => {
        const t: Record<string, Row[]> = { users: [{ id: 'A', referral_code: 'ABCD1234' }, { id: 'B', referred_by: null }], user_onboarding: [] }
        const db = fakeDb(t)
        await ensureOnboardingRow(db, { userId: 'B', authCreatedAt: NEW, refCookie: 'ABCD1234', termsAt: null, provider: 'kakao' })
        expect(t.user_onboarding[0]).toMatchObject({ user_id: 'B', referrer_id: 'A' })
    })
})

describe('추천 보상 숫자 하나, 주는 곳 하나', () => {
    const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
    it('보상은 50개', () => expect(REFERRER_REWARD).toBe(50))
    it('로그인 콜백은 추천 보상을 주지 않는다', () => {
        expect(src('src/app/auth/callback/route.ts')).not.toMatch(/REFERRER_REWARD|referral_invite/)
    })
    it('보상은 휴대폰 인증 한 곳에서만 준다', () => {
        expect(src('src/app/api/trial/verify/route.ts')).toMatch(/더할값: REFERRER_REWARD/)
    })
    it('화면·계산에 100 을 박아 두지 않는다', () => {
        expect(src('src/app/api/referral/route.ts')).not.toMatch(/\*\s*100/)
    })
})
