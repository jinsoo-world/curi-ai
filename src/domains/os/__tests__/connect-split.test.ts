import { describe, it, expect } from 'vitest'
import { splitConnectServices } from '../connect-split'

const svc = (id: string, ready: boolean, extra: Partial<{ comingSoon: boolean; connected: unknown }> = {}) =>
    ({ id, ready, comingSoon: extra.comingSoon ?? false, connected: extra.connected ?? null })

describe('연결 목록 나누기: 누를 수 없는 단추를 줄줄이 두지 않는다', () => {
    it('기능이 꺼져 있으면(지금 라이브) 전부 곧 열려요, 로그인 안내 없음', () => {
        const r = splitConnectServices([svc('notion', false), svc('kakao', false)], { enabled: false, loggedIn: false, pasteIds: ['notion'] })
        expect(r.active).toEqual([])
        expect(r.soon.map(s => s.id)).toEqual(['notion', 'kakao'])
        expect(r.needLogin).toBe(false)
    })

    it('준비된 것만 줄로, 나머지는 곧 열려요', () => {
        const r = splitConnectServices([svc('google', true), svc('kakao', false), svc('x', true, { comingSoon: true })], { enabled: true, loggedIn: true })
        expect(r.active.map(s => s.id)).toEqual(['google'])
        expect(r.soon.map(s => s.id)).toEqual(['kakao', 'x'])
    })

    it('이미 연결된 것은 준비 여부와 상관없이 줄로 남는다(해제할 수 있게)', () => {
        const r = splitConnectServices([svc('kakao', false, { connected: { id: 'c1' } })], { enabled: false, loggedIn: true })
        expect(r.active.map(s => s.id)).toEqual(['kakao'])
    })

    it('열쇠 붙이기 옛길이 있는 것은 줄로 보인다', () => {
        const r = splitConnectServices([svc('notion', false), svc('slack', false), svc('kakao', false)], { enabled: true, loggedIn: true, pasteIds: ['notion', 'slack'] })
        expect(r.active.map(s => s.id)).toEqual(['notion', 'slack'])
    })

    it('로그인 전인데 붙일 수 있는 게 있으면 로그인 안내를 켠다', () => {
        const r = splitConnectServices([svc('google', true)], { enabled: true, loggedIn: false })
        expect(r.needLogin).toBe(true)
    })
})
