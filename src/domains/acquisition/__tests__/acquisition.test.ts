import { describe, it, expect } from 'vitest'
import { campaignOf, channelOf, deviceOf, isAuthReturn, looksLikeBot } from '../labels'
import { fmtRate, rate, summarize, type Attribution, type VisitRow } from '../summarize'
import { sanitizeFirstTouch } from '../first-touch-input'
import { buildSnapshot, fromSnapshot, markFirstPaid } from '../attr'
import { pickPeriod } from '../period'

const attr = (o: Partial<Attribution> = {}): Attribution => ({ tracked: true, survey: null, ...o })
const visit = (o: Partial<VisitRow> = {}): VisitRow => ({ created_at: '2026-10-05T00:00:00Z', anon_id: 'a', user_id: null, ...o })

describe('이름 붙이기', () => {
    it('utm_source 가 먼저, 대소문자는 합친다', () => {
        expect(channelOf({ utm_source: ' KaKao ', referrer: 'https://google.com/' })).toBe('kakao')
    })
    it('추천 링크, 바깥 사이트, 직접 순서', () => {
        expect(channelOf({ ref_code: 'abc' })).toBe('추천 링크')
        expect(channelOf({ referrer: 'https://www.google.co.kr/search' })).toBe('google')
        expect(channelOf({ referrer: 'https://gemini.google.com/app' })).toBe('gemini')
        expect(channelOf({ referrer: 'https://l.instagram.com/?u=x' })).toBe('instagram')
        expect(channelOf({ referrer: 'https://m.blog.naver.com/x' })).toBe('naver 블로그')
        expect(channelOf({})).toBe('직접')
    })
    it('로그인하고 돌아온 것은 직접으로 본다', () => {
        expect(isAuthReturn('https://accounts.google.com/')).toBe(true)
        expect(isAuthReturn('https://kauth.kakao.com/oauth')).toBe(true)
        expect(channelOf({ referrer: 'https://accounts.kakao.com/login' })).toBe('직접')
    })
    it('캠페인 이름', () => {
        expect(campaignOf({ utm_source: 'meta', utm_campaign: 'Oct_A' })).toBe('meta / oct_a')
        expect(campaignOf({ utm_source: 'meta' })).toBe('meta / 캠페인 없음')
    })
    it('기기 이름', () => {
        expect(deviceOf({ app_shell: 'ios_app', device: 'mobile', os: 'ios' })).toBe('iOS 앱')
        expect(deviceOf({ app_shell: 'android_app' })).toBe('Android 앱')
        expect(deviceOf({ device: 'pc', os: 'mac', app_shell: 'web' })).toBe('PC')
        expect(deviceOf({ device: 'mobile', os: 'ios', app_shell: 'web' })).toBe('모바일 iOS 웹')
        expect(deviceOf({ device: 'mobile', os: 'android' })).toBe('모바일 Android 웹')
        expect(deviceOf({})).toBe('알 수 없음')
    })
    it('로봇을 거른다', () => {
        expect(looksLikeBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
        expect(looksLikeBot(null)).toBe(true)
        expect(looksLikeBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false)
    })
})

describe('묶어 세기', () => {
    const visits = [
        visit({ anon_id: 'a', utm_source: 'kakao', utm_campaign: 'c1', device: 'mobile', os: 'ios' }),
        visit({ anon_id: 'a', utm_source: 'kakao', utm_campaign: 'c1', device: 'mobile', os: 'ios' }),
        visit({ anon_id: 'b', utm_source: 'kakao', utm_campaign: 'c1', device: 'pc', os: 'mac' }),
        visit({ anon_id: 'c', device: 'pc', os: 'windows' }),
        visit({ anon_id: 'd', referrer: 'https://accounts.google.com/' }), // 로그인 복귀: 세지 않는다
    ]
    const signups = [
        { user_id: 'u1', created_at: 'x', attr: attr({ utm_source: 'kakao', utm_campaign: 'c1', device: 'mobile', os: 'ios', survey: 'friend' }) },
        { user_id: 'u2', created_at: 'x', attr: attr({ device: 'pc', os: 'mac' }) },
        { user_id: 'u3', created_at: 'x', attr: attr({ tracked: false }) },
        { user_id: 'u4', created_at: 'x', attr: null },
    ]
    const paid = [{ user_id: 'u1', at: 'x', provider: 'toss', attr: signups[0].attr }]
    const s = summarize({ visits, signups, paid, surveyLabel: id => `라벨:${id}` })

    it('합계', () => {
        expect(s.totals).toEqual({ visits: 4, visitors: 3, signups: 4, paid: 1, untrackedSignups: 2 })
    })
    it('채널별', () => {
        const k = s.channel.find(c => c.key === 'kakao')!
        expect(k).toEqual({ key: 'kakao', visits: 3, visitors: 2, signups: 1, paid: 1 })
        expect(s.channel[0].key).toBe('kakao') // 결제가 많은 곳이 위
        expect(s.channel.find(c => c.key === '직접')).toMatchObject({ visits: 1, signups: 1, paid: 0 })
        expect(s.channel.find(c => c.key === '추적 전 가입 (출처 모름)')).toMatchObject({ visits: 0, signups: 2 })
    })
    it('캠페인별 기기별 설문별', () => {
        expect(s.campaign.find(c => c.key === 'kakao / c1')).toMatchObject({ visitors: 2, signups: 1, paid: 1 })
        expect(s.device.find(c => c.key === '모바일 iOS 웹')).toMatchObject({ visitors: 1, signups: 1, paid: 1 })
        expect(s.device.find(c => c.key === 'PC')).toMatchObject({ visitors: 2, signups: 1 })
        expect(s.survey.find(c => c.key === '라벨:friend')).toMatchObject({ signups: 1, paid: 1 })
        expect(s.survey.find(c => c.key === '설문에 답하지 않음')?.signups).toBe(3)
    })
    it('비율', () => {
        expect(rate(1, 0)).toBeNull()
        expect(fmtRate(rate(1, 3))).toBe('33%')
        expect(fmtRate(rate(1, 40))).toBe('2.5%')
        expect(fmtRate(null)).toBe('')
    })
})

describe('가입에 잇는 입력 다듬기', () => {
    const now = new Date('2026-10-05T10:00:00Z')
    it('정상 값을 받는다', () => {
        const c = sanitizeFirstTouch({ utm_source: 'meta', utm_campaign: 'x', referrer: 'https://a.com', ref_code: 'r1', device: 'mobile', os: 'ios', app_shell: 'web', at: '2026-10-01T00:00:00Z', path: '/os' }, 'x', now)!
        expect(c).toMatchObject({ utm_source: 'meta', ref_code: 'r1', device: 'mobile', os: 'ios', landing_path: '/os', at: '2026-10-01T00:00:00.000Z' })
    })
    it('엉뚱한 값과 미래 시각은 버린다', () => {
        const c = sanitizeFirstTouch({ device: 'tv', os: 'beos', at: '2030-01-01T00:00:00Z' }, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', now)!
        expect(c.device).toBe('pc'); expect(c.os).toBe('windows'); expect(c.at).toBe(now.toISOString())
        expect(sanitizeFirstTouch('x', null)).toBeNull()
    })
})

describe('결제 사본', () => {
    it('사본을 만들고 다시 읽는다', () => {
        const snap = buildSnapshot(attr({ utm_source: 'meta', device: 'pc' }), 'toss')
        expect(fromSnapshot(snap, 'friend')).toMatchObject({ utm_source: 'meta', device: 'pc', tracked: true, survey: 'friend' })
        expect(fromSnapshot(buildSnapshot(null, 'toss'), null)).toBeNull()
    })
    it('처음 결제 기록은 실패해도 던지지 않는다', async () => {
        const boom = { from: () => { throw new Error('x') } } as never
        expect(await markFirstPaid(boom, 'u', 'toss')).toBe(false)
    })
    it('처음 결제만 적는다', async () => {
        const calls: { table: string; patch?: unknown; isNull?: string }[] = []
        const db = {
            from(table: string) {
                const rec: { table: string; patch?: unknown; isNull?: string } = { table }
                calls.push(rec)
                const q: Record<string, unknown> = {
                    select: () => q, eq: () => q,
                    maybeSingle: async () => ({ data: { user_id: 'u', utm_source: 'meta', first_touch_at: '2026-10-01T00:00:00Z' } }),
                    update: (p: unknown) => { rec.patch = p; return q },
                    is: (c: string) => { rec.isNull = c; return q },
                    then: (ok: (v: unknown) => unknown) => ok({ data: [{ user_id: 'u' }], error: null }),
                }
                return q
            },
        } as never
        expect(await markFirstPaid(db, 'u', 'toss', new Date('2026-10-05T00:00:00Z'))).toBe(true)
        const upd = calls.find(c => c.table === 'user_plans')!
        expect(upd.isNull).toBe('first_paid_at')
        expect(upd.patch).toMatchObject({ first_paid_provider: 'toss', paid_attribution: { utm_source: 'meta', tracked: true } })
    })
})

describe('기간 고르기', () => {
    const now = new Date('2026-10-05T03:00:00Z') // 한국 12시
    it('버튼 7일', () => {
        const p = pickPeriod({ days: '7' }, now)
        expect(p.to).toBe('2026-10-05'); expect(p.from).toBe('2026-09-29'); expect(p.days).toBe(7)
        expect(Date.parse(p.prev.endIso)).toBe(Date.parse(p.startIso))
    })
    it('날짜 직접', () => {
        const p = pickPeriod({ from: '2026-10-01', to: '2026-10-03' }, now)
        expect(p.days).toBe(3)
    })
    it('기본은 30일, 거꾸로 넣으면 바로잡는다', () => {
        expect(pickPeriod({}, now).days).toBe(30)
        expect(pickPeriod({ from: '2026-10-03', to: '2026-10-01' }, now).days).toBe(3)
    })
})
