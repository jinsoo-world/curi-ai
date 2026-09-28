import { describe, it, expect } from 'vitest'
import { countVisit, markFirstChatDone, readInstallGate, shouldShowInstall, INSTALL_KEYS } from '../install-rules'

const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } } }

describe('설치 안내: 첫 방문엔 안 뜨고, 두 번째 방문이나 첫 대화 뒤에 뜬다', () => {
    it('첫 방문은 안 뜬다', () => {
        const local = mem(), session = mem()
        const v = countVisit(local, session)
        expect(v).toBe(1)
        expect(shouldShowInstall(readInstallGate(local, 'd1', false, v))).toBe(false)
    })

    it('같은 세션에서 다시 세도 방문은 1번이다', () => {
        const local = mem(), session = mem()
        countVisit(local, session)
        expect(countVisit(local, session)).toBe(1)
    })

    it('두 번째 세션(방문)부터 뜬다', () => {
        const local = mem()
        countVisit(local, mem())
        const v = countVisit(local, mem())
        expect(v).toBe(2)
        expect(shouldShowInstall(readInstallGate(local, 'd1', false, v))).toBe(true)
    })

    it('첫 방문이라도 대화를 한 번 끝냈으면 뜬다', () => {
        const local = mem(), session = mem()
        const v = countVisit(local, session)
        markFirstChatDone(local)
        expect(local.m.get(INSTALL_KEYS.chatDone)).toBe('1')
        expect(shouldShowInstall(readInstallGate(local, 'd1', false, v))).toBe(true)
    })

    it('오늘 이미 보였거나, 설치했거나, 앱으로 열려 있으면 안 뜬다', () => {
        expect(shouldShowInstall({ standalone: false, installed: false, shownToday: true, visits: 5, chatDone: true })).toBe(false)
        expect(shouldShowInstall({ standalone: false, installed: true, shownToday: false, visits: 5, chatDone: true })).toBe(false)
        expect(shouldShowInstall({ standalone: true, installed: false, shownToday: false, visits: 5, chatDone: true })).toBe(false)
    })

    it('저장소가 터져도 죽지 않는다', () => {
        const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
        expect(() => countVisit(bad, bad)).not.toThrow()
        expect(() => markFirstChatDone(bad)).not.toThrow()
        expect(readInstallGate(bad, 'd1', false, 1).installed).toBe(false)
    })
})
