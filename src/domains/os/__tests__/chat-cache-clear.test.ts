import { describe, expect, it } from 'vitest'
import { clearChatCache, readChatCache, writeChatCache } from '../chat-cache'

function mem() {
    const m = new Map<string, string>()
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => { m.set(k, v) },
        removeItem: (k: string) => { m.delete(k) },
    }
}

describe('clearChatCache', () => {
    it('봇 캐시를 지워 대화 새로 시작이 빈 방으로 보이게 한다', () => {
        const s = mem()
        writeChatCache(s, 'bot1', {
            sessionId: 'old',
            messages: [{ content: '옛말' }],
        })
        expect(readChatCache(s, 'bot1')?.messages).toHaveLength(1)
        clearChatCache(s, 'bot1')
        expect(readChatCache(s, 'bot1')).toBeNull()
    })
})
