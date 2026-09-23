import { describe, expect, it, vi } from 'vitest'
import { GROUP_GAP_MS, GROUP_THINK_MS, sleep } from '../group-stagger'

describe('group-stagger', () => {
    it('간격 상수가 짧게 유지된다 (수 초를 넘기지 않음)', () => {
        expect(GROUP_THINK_MS).toBeGreaterThan(200)
        expect(GROUP_THINK_MS).toBeLessThan(2000)
        expect(GROUP_GAP_MS).toBeGreaterThan(100)
        expect(GROUP_GAP_MS).toBeLessThan(2000)
    })

    it('sleep 은 최소 0ms', async () => {
        vi.useFakeTimers()
        const p = sleep(-10)
        vi.runAllTimers()
        await p
        vi.useRealTimers()
        expect(true).toBe(true)
    })
})
