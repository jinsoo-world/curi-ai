import { describe, it, expect } from 'vitest'
import { CHAT_CACHE_MAX, chatCacheKey, readChatCache, writeChatCache } from '../chat-cache'

interface M { id: string; role: 'user' | 'assistant'; content: string; card?: { id: string } }

function memStore() {
    const m = new Map<string, string>()
    return {
        getItem: (k: string) => m.get(k) ?? null,
        setItem: (k: string, v: string) => { m.set(k, v) },
        removeItem: (k: string) => { m.delete(k) },
        size: () => m.size,
    }
}

describe('os/chat-cache — 봇별 대화 기록을 탭 저장소에 둔다', () => {
    it('열쇠는 봇 id 로 갈린다', () => {
        expect(chatCacheKey('a')).not.toBe(chatCacheKey('b'))
        expect(chatCacheKey('a')).toContain('a')
    })

    it('쓴 것을 그대로 읽는다 (세션 id 포함)', () => {
        const s = memStore()
        const msgs: M[] = [{ id: 'u1', role: 'user', content: '안녕' }, { id: 'a1', role: 'assistant', content: '네' }]
        writeChatCache(s, 'bot1', { sessionId: 'sess-1', messages: msgs })
        expect(readChatCache<M>(s, 'bot1')).toEqual({ sessionId: 'sess-1', messages: msgs })
        expect(readChatCache<M>(s, 'bot2')).toBeNull()
    })

    it('최근 50개만 남긴다', () => {
        const s = memStore()
        const msgs: M[] = Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, role: 'user', content: String(i) }))
        writeChatCache(s, 'bot1', { sessionId: null, messages: msgs })
        const got = readChatCache<M>(s, 'bot1')!
        expect(got.messages).toHaveLength(CHAT_CACHE_MAX)
        expect(got.messages[0].id).toBe('m30')
        expect(got.messages[49].id).toBe('m79')
    })

    it('아직 답이 안 온 빈 말풍선(스트림 자리)은 저장하지 않는다. 승인 카드는 남긴다', () => {
        const s = memStore()
        const msgs: M[] = [
            { id: 'u1', role: 'user', content: '보내줘' },
            { id: 'a1', role: 'assistant', content: '', card: { id: 'c1' } },
            { id: 'a2', role: 'assistant', content: '' },
        ]
        writeChatCache(s, 'bot1', { sessionId: null, messages: msgs })
        expect(readChatCache<M>(s, 'bot1')!.messages.map(m => m.id)).toEqual(['u1', 'a1'])
    })

    it('비어 있으면 열쇠를 지운다', () => {
        const s = memStore()
        writeChatCache(s, 'bot1', { sessionId: null, messages: [{ id: 'u1', role: 'user', content: 'x' }] })
        writeChatCache(s, 'bot1', { sessionId: null, messages: [] })
        expect(s.size()).toBe(0)
        expect(readChatCache<M>(s, 'bot1')).toBeNull()
    })

    it('깨진 값, 저장소 없음은 null 로 조용히 넘긴다', () => {
        const s = memStore()
        s.setItem(chatCacheKey('bot1'), '{not json')
        expect(readChatCache<M>(s, 'bot1')).toBeNull()
        s.setItem(chatCacheKey('bot1'), JSON.stringify({ messages: 'no' }))
        expect(readChatCache<M>(s, 'bot1')).toBeNull()
        expect(readChatCache<M>(null, 'bot1')).toBeNull()
        const 던지는 = { getItem: () => { throw new Error('막힘') }, setItem: () => { throw new Error('막힘') }, removeItem: () => {} }
        expect(readChatCache<M>(던지는, 'bot1')).toBeNull()
        expect(() => writeChatCache(던지는, 'bot1', { sessionId: null, messages: [{ id: 'u', role: 'user', content: 'x' }] })).not.toThrow()
    })
})
