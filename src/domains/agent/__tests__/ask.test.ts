import { describe, it, expect, vi, beforeEach } from 'vitest'

const streamMock = vi.fn()
vi.mock('@/domains/chat/stream', () => ({
    generateChatStream: (...args: unknown[]) => streamMock(...args),
    UNAVAILABLE_TEXT: '지금은 잠깐 쉬는 중이에요. 잠시 뒤에 다시 말 걸어 주세요.',
}))
vi.mock('@/domains/llm', () => ({
    solarChatStream: vi.fn(),
}))

import { askChat } from '../ask'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'

async function* gen(texts: string[]) {
    for (const t of texts) yield { text: t }
}

describe('askChat — 스트림 수집 + 쉬는 중은 null', () => {
    beforeEach(() => {
        streamMock.mockReset()
        vi.stubEnv('UPSTAGE_API_KEY', 'up')
        vi.stubEnv('GEMINI_API_KEY', 'gm')
    })

    it('스트림 조각을 이어 붙여 한 줄로 돌려준다', async () => {
        streamMock.mockResolvedValue(gen(['안', '녕']))
        await expect(askChat('시스템', '안녕')).resolves.toBe('안녕')
        expect(streamMock).toHaveBeenCalledTimes(1)
    })

    it('UNAVAILABLE_TEXT 만 오면 null (호출쪽이 쉬는 중을 붙인다)', async () => {
        streamMock.mockResolvedValue(gen([UNAVAILABLE_TEXT]))
        await expect(askChat('시스템', '안녕')).resolves.toBeNull()
    })

    it('빈 답이면 null', async () => {
        streamMock.mockResolvedValue(gen(['  ', '']))
        await expect(askChat('시스템', '안녕')).resolves.toBeNull()
    })

    it('스트림이 던지면 null (절대 안 던진다)', async () => {
        streamMock.mockRejectedValue(new Error('boom'))
        await expect(askChat('시스템', '안녕')).resolves.toBeNull()
    })
})
