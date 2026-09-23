import { describe, it, expect } from 'vitest'
import { SIDEBAR_AWAKE_MS, isBusyPresence, sidebarEyeState } from '../sidebar-eyes'

describe('sidebarEyeState', () => {
    it('고르지 않으면 자는 중', () => {
        expect(sidebarEyeState({ selected: false, awake: true })).toBe('sleeping')
        expect(sidebarEyeState({ selected: false, awake: false, presence: 'talking' })).toBe('sleeping')
    })

    it('고르고 깨어 있으면 듣는 중', () => {
        expect(sidebarEyeState({ selected: true, awake: true })).toBe('listening')
        expect(sidebarEyeState({ selected: true, awake: true, presence: 'idle' })).toBe('listening')
        expect(sidebarEyeState({ selected: true, awake: true, presence: 'sleeping' })).toBe('listening')
    })

    it('고르고 잠들면 자는 중', () => {
        expect(sidebarEyeState({ selected: true, awake: false })).toBe('sleeping')
        expect(sidebarEyeState({ selected: true, awake: false, presence: 'idle' })).toBe('sleeping')
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
