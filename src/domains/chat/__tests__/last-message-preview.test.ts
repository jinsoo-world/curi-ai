// 명단 화면의 「마지막 말 한 줄」 — 앞 60자, 줄바꿈은 공백, 없으면 null
import { describe, it, expect, vi } from 'vitest'
import { makePreview, fetchLastMessages } from '../last-message-preview'

describe('makePreview', () => {
    it('60자까지만 자른다', () => {
        expect(makePreview('가'.repeat(100))).toBe('가'.repeat(60))
    })
    it('줄바꿈은 공백 하나로, 앞뒤 공백은 지운다', () => {
        expect(makePreview('  안녕\n\n하세요\r\n반가워요 ')).toBe('안녕 하세요 반가워요')
    })
    it('비었거나 없으면 null', () => {
        expect(makePreview('')).toBeNull()
        expect(makePreview('  \n ')).toBeNull()
        expect(makePreview(null)).toBeNull()
        expect(makePreview(undefined)).toBeNull()
    })
})

describe('fetchLastMessages', () => {
    it('id 가 없으면 DB 를 부르지 않는다', async () => {
        const rpc = vi.fn()
        expect(await fetchLastMessages({ rpc } as never, 'session', [])).toEqual({})
        expect(rpc).not.toHaveBeenCalled()
    })
    it('한 번의 호출로 방마다 마지막 말을 받는다 (N+1 없음)', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: [
            { owner_id: 'a', content: '첫째\n줄', created_at: '2026-10-06T01:00:00Z' },
            { owner_id: 'b', content: '둘째', created_at: '2026-10-06T02:00:00Z' },
        ], error: null })
        const r = await fetchLastMessages({ rpc } as never, 'channel', ['a', 'b', 'c'])
        expect(rpc).toHaveBeenCalledTimes(1)
        expect(rpc).toHaveBeenCalledWith('last_messages_for_channels', { p_ids: ['a', 'b', 'c'] })
        expect(r.a).toEqual({ preview: '첫째 줄', at: '2026-10-06T01:00:00Z' })
        expect(r.c).toBeUndefined()
    })
    it('함수가 아직 없거나 실패하면 빈 결과(화면은 안 깨진다)', async () => {
        const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'no fn' } })
        expect(await fetchLastMessages({ rpc } as never, 'session', ['a'])).toEqual({})
    })
})
