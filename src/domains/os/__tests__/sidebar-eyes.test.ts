import { describe, it, expect } from 'vitest'
import { SIDEBAR_AWAKE_MS, isBusyPresence, sidebarEyeState } from '../sidebar-eyes'

describe('sidebarEyeState', () => {
    it('고르지 않으면 쉬는 중(눈 뜸)', () => {
        expect(sidebarEyeState({ selected: false, awake: true })).toBe('idle')
        expect(sidebarEyeState({ selected: false, awake: false, presence: 'talking' })).toBe('idle')
    })

    it('고르고 깨어 있으면 듣는 중', () => {
        expect(sidebarEyeState({ selected: true, awake: true })).toBe('listening')
        expect(sidebarEyeState({ selected: true, awake: true, presence: 'idle' })).toBe('listening')
        expect(sidebarEyeState({ selected: true, awake: true, presence: 'sleeping' })).toBe('listening')
    })

    it('고른 뒤 타이머가 끝나면 쉬는 중(눈 뜸, 잠들지 않음)', () => {
        expect(sidebarEyeState({ selected: true, awake: false })).toBe('idle')
        expect(sidebarEyeState({ selected: true, awake: false, presence: 'idle' })).toBe('idle')
    })

    it('대화 busy 상태는 고른 칸에서 우선', () => {
        expect(sidebarEyeState({ selected: true, awake: false, presence: 'thinking' })).toBe('thinking')
        expect(sidebarEyeState({ selected: true, awake: true, presence: 'talking' })).toBe('talking')
        expect(sidebarEyeState({ selected: true, awake: true, presence: 'working' })).toBe('working')
        expect(sidebarEyeState({ selected: true, awake: true, presence: 'waiting_approval' })).toBe('waiting_approval')
        expect(sidebarEyeState({ selected: true, awake: true, presence: 'error' })).toBe('error')
    })

    it('상수와 busy 판별', () => {
        expect(SIDEBAR_AWAKE_MS).toBe(30_000)
        expect(isBusyPresence('thinking')).toBe(true)
        expect(isBusyPresence('idle')).toBe(false)
        expect(isBusyPresence('sleeping')).toBe(false)
        expect(isBusyPresence(null)).toBe(false)
    })
})
