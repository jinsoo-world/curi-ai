import { describe, it, expect } from 'vitest'
import {
    sanitizeStep, needsOnboarding, detectClientContext, cleanRefCode, parseTermsCookie, firstJobFor,
    FIRST_HELP_CHIPS, SAMPLE_EXCHANGE, USE_CASES, LEADER_CARD, ONBOARDING_SINCE,
} from '../onboarding'

describe('needsOnboarding', () => {
    it('행이 있으면 그 상태로 가린다', () => {
        expect(needsOnboarding({ status: 'started', authCreatedAt: '2020-01-01T00:00:00Z' })).toBe(true)
        expect(needsOnboarding({ status: 'done', authCreatedAt: '2030-01-01T00:00:00Z' })).toBe(false)
        expect(needsOnboarding({ status: 'skipped', authCreatedAt: '2030-01-01T00:00:00Z' })).toBe(false)
    })
    it('행이 없으면 가입 시각으로 (기존 회원은 강제하지 않는다)', () => {
        expect(needsOnboarding({ status: null, authCreatedAt: '2026-09-28T05:30:03Z' })).toBe(false)
        expect(needsOnboarding({ status: null, authCreatedAt: ONBOARDING_SINCE })).toBe(true)
        expect(needsOnboarding({ status: null, authCreatedAt: '2026-10-01T00:00:00Z' })).toBe(true)
        expect(needsOnboarding({ status: null, authCreatedAt: null })).toBe(false)
        expect(needsOnboarding({ status: null, authCreatedAt: 'x' })).toBe(false)
    })
})

describe('sanitizeStep', () => {
    it('약관 3개가 모두 있어야 한다', () => {
        expect('error' in sanitizeStep('terms', { age: true, terms: true })).toBe(true)
        const ok = sanitizeStep('terms', { age: true, terms: true, privacy: true, marketing: true })
        expect('step' in ok && ok.fields.marketing).toBe(true)
    })
    it('알게 된 경로: 소개일 때만 코드, 모르는 값은 막는다', () => {
        expect('error' in sanitizeStep('source', { acquisition_source: 'tv' })).toBe(true)
        const a = sanitizeStep('source', { acquisition_source: 'leader', leader_code_entered: ' ab-12 cd ' })
        expect('step' in a && a.fields.leader_code_entered).toBe('AB12CD')
        const b = sanitizeStep('source', { acquisition_source: 'youtube', leader_code_entered: 'ABCD1234' })
        expect('step' in b && b.fields.leader_code_entered).toBe(null)
        const c = sanitizeStep('source', { acquisition_source: 'ai_chatbot', acquisition_detail: '  챗GPT  ' })
        expect('step' in c && c.fields.acquisition_detail).toBe('챗GPT')
    })
    it('맡길 일은 최대 3개, 중복과 모르는 값은 뺀다', () => {
        const r = sanitizeStep('uses', { use_cases: ['promo', 'promo', 'x', 'customer', 'docs', 'quote'] })
        expect('step' in r && r.fields.use_cases).toEqual(['promo', 'customer', 'docs'])
        expect('error' in sanitizeStep('uses', { use_cases: [] })).toBe(true)
    })
    it('나이대는 필수, 성별과 업종은 선택', () => {
        expect('error' in sanitizeStep('profile', { gender: 'female' })).toBe(true)
        const r = sanitizeStep('profile', { age_band: '50s', gender: 'x' })
        expect('step' in r && r.fields).toEqual({ age_band: '50s', gender: null, occupation: null })
    })
    it('아니요면 리더 칸을 비운다', () => {
        const r = sanitizeStep('leader', { runs_class_or_group: 'none', org_name: 'a', leader_contact_ok: true })
        expect('step' in r && r.fields).toEqual({ runs_class_or_group: 'none', audience_size_band: null, org_name: null, leader_contact_ok: false })
        const y = sanitizeStep('leader', { runs_class_or_group: 'class', audience_size_band: '10_30', org_name: ' 글쓰기 모임 ', leader_contact_ok: true })
        expect('step' in y && y.fields.org_name).toBe('글쓰기 모임')
    })
    it('모르는 단계는 막는다', () => {
        expect('error' in sanitizeStep('hack', {})).toBe(true)
    })
})

describe('도우미', () => {
    it('초대 코드 정리', () => {
        expect(cleanRefCode('ab12')).toBe('AB12')
        expect(cleanRefCode('a1')).toBe(null)
        expect(cleanRefCode(5)).toBe(null)
    })
    it('약관 쿠키는 하루 안의 시각만 믿는다', () => {
        const now = Date.parse('2026-09-29T00:00:00Z')
        expect(parseTermsCookie(`v1-2026-09:${now - 1000}`, now)).toBe(new Date(now - 1000).toISOString())
        expect(parseTermsCookie(`v1-2026-09:${now - 2 * 86400_000}`, now)).toBe(null)
        expect(parseTermsCookie(`v1:${now + 3600_000}`, now)).toBe(null)
        expect(parseTermsCookie('junk', now)).toBe(null)
    })
    it('기기와 앱 여부', () => {
        const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
        expect(detectClientContext(iphone, 'ios')).toEqual({ device: 'mobile', os: 'ios', app_shell: 'ios_app' })
        expect(detectClientContext('Mozilla/5.0 (Linux; Android 14; wv) Mobile', 'android').app_shell).toBe('android_app')
        expect(detectClientContext('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', null)).toEqual({ device: 'pc', os: 'windows', app_shell: 'web' })
    })
    it('첫 봇은 맡길 일 첫 번째로', () => {
        expect(firstJobFor(['research', 'promo'])).toBe('research_lead')
        expect(firstJobFor(['customer'])).toBe('marketing_lead')
        expect(firstJobFor([])).toBe('planning_lead')
    })
    it('모든 맡길 일에 칩 3개와 예시가 있다', () => {
        for (const c of USE_CASES) {
            expect(FIRST_HELP_CHIPS[c.id as keyof typeof FIRST_HELP_CHIPS]).toHaveLength(3)
            expect(SAMPLE_EXCHANGE[c.id as keyof typeof SAMPLE_EXCHANGE].bot.length).toBeGreaterThan(10)
        }
    })
    it('리더 카드에 숫자(비율, 배수)가 없다', () => {
        expect(Object.values(LEADER_CARD).join(' ')).not.toMatch(/\d|%|배/)
    })
})

import { summarizeOnboarding, kstRange, toCsv, type OnbRow } from '../onboarding-admin'

describe('관리자 온보딩 집계', () => {
    const base: OnbRow = {
        user_id: 'a', status: 'done', acquisition_source: 'ai_chatbot', acquisition_detail: null, referral_code: null, referral_via: null,
        use_cases: ['promo', 'customer'], age_band: '50s', gender: null, occupation: 'shop', runs_class_or_group: 'none',
        audience_size_band: null, org_name: '=cmd', leader_contact_ok: false, marketing_agreed: true, terms_agreed_at: null,
        device: 'mobile', os: 'ios', app_shell: 'ios_app', utm_source: null, utm_medium: null, utm_campaign: null, referrer: null,
        started_at: '2026-09-28T15:00:00Z', completed_at: '2026-09-28T15:03:00Z',
    }
    const users = [
        { id: 'a', email: 'a@x.com', display_name: '가', created_at: '2026-09-28T15:00:00Z' },
        { id: 'b', email: null, display_name: null, created_at: '2026-09-28T16:00:00Z' },
    ]
    it('흐름과 나눔', () => {
        const s = summarizeOnboarding(users, [base, { ...base, user_id: 'zzz' }], new Set(['a', 'b']), new Set(['a']))
        expect(s.funnel).toEqual({ signups: 2, started: 1, done: 1, firstBot: 2, firstMessage: 1 })
        expect(s.bySource[0]).toMatchObject({ key: 'ai_chatbot', count: 1 })
        expect(s.byUseCase.map(x => x.key).sort()).toEqual(['customer', 'promo'])
        expect(s.byShell[0].label).toBe('아이폰 앱')
    })
    it('KST 기간 경계', () => {
        const r = kstRange('2026-09-28', '2026-09-28')
        expect(r.startIso).toBe('2026-09-27T15:00:00.000Z')
        expect(r.endIso).toBe('2026-09-28T15:00:00.000Z')
        const d = kstRange(null, null, new Date('2026-09-28T14:30:00Z'))
        expect(d.to).toBe('2026-09-28')
        expect(d.from).toBe('2026-09-15')
    })
    it('CSV = BOM, 머리줄, 수식 주입 막기', () => {
        const csv = toCsv(users, [base], new Set(['a']), new Set())
        expect(csv.startsWith('\uFEFF가입시각_KST,')).toBe(true)
        expect(csv).toContain("'=cmd")
        expect(csv.split('\r\n')).toHaveLength(3)
    })
})
