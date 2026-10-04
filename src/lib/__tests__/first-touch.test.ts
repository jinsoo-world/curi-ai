import { describe, it, expect } from 'vitest'
import { ensureVisitorIds, recordFirstTouch, FIRST_TOUCH_KEY, VISITOR_KEY } from '@/lib/first-touch'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m } }

describe('first-touch', () => {
    it('방문자 표식을 한 번만 만든다', () => {
        const s = mem()
        const a = ensureVisitorIds(s)
        expect(a.visitorId).toBeTruthy(); expect(a.anonId).toBeTruthy()
        expect(ensureVisitorIds(s)).toEqual(a)
        expect(s.m.get(VISITOR_KEY)).toBe(a.visitorId)
    })
    it('기존 표식은 그대로 쓴다', () => {
        const s = mem(); s.setItem(VISITOR_KEY, 'old')
        expect(ensureVisitorIds(s).visitorId).toBe('old')
    })
    it('처음 들어온 utm 과 referrer 를 한 번만 적는다', () => {
        const s = mem()
        const ft = recordFirstTouch(s, { params: new URLSearchParams('utm_source=kakao&utm_campaign=c1'), referrer: 'https://m.search.naver.com/x', host: 'curi.ai', path: '/home' })
        expect(ft.utm_source).toBe('kakao'); expect(ft.referrer).toContain('naver')
        const again = recordFirstTouch(s, { params: new URLSearchParams('utm_source=other'), referrer: '', host: 'curi.ai', path: '/x' })
        expect(again.utm_source).toBe('kakao')
        expect(JSON.parse(s.m.get(FIRST_TOUCH_KEY)!).path).toBe('/home')
    })
    it('우리 사이트 안 referrer 는 비운다', () => {
        const s = mem()
        expect(recordFirstTouch(s, { params: new URLSearchParams(), referrer: 'https://curi.ai/a', host: 'curi.ai', path: '/b' }).referrer).toBeNull()
    })
})

describe('first-touch 기기와 추천 코드 (2026-10-05)', () => {
    const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    it('처음 들어온 기기와 ?ref 를 적는다', () => {
        const s = mem()
        const ft = recordFirstTouch(s, { params: new URLSearchParams('ref=abc12'), referrer: '', host: 'curi.ai', path: '/os', ua: IPHONE })
        expect(ft.ref_code).toBe('abc12'); expect(ft.device).toBe('mobile'); expect(ft.os).toBe('ios'); expect(ft.app_shell).toBe('web')
    })
    it('앱 껍데기를 알려 주면 앱으로 적는다', () => {
        const ft = recordFirstTouch(mem(), { params: new URLSearchParams(), referrer: '', host: 'h', path: '/', ua: IPHONE, nativePlatform: 'ios' })
        expect(ft.app_shell).toBe('ios_app')
    })
    it('예전에 기기 없이 적힌 기록에는 기기만 채우고 나머지는 그대로', () => {
        const s = mem()
        s.setItem(FIRST_TOUCH_KEY, JSON.stringify({ utm_source: 'kakao', utm_medium: null, utm_campaign: null, referrer: null, path: '/a', at: '2026-10-01T00:00:00Z' }))
        const ft = recordFirstTouch(s, { params: new URLSearchParams('utm_source=x'), referrer: '', host: 'h', path: '/b', ua: IPHONE })
        expect(ft.utm_source).toBe('kakao'); expect(ft.device).toBe('mobile')
    })
})
