// 봇별 대화 기록을 탭 저장소(sessionStorage)에 둔다.
// 왜 = 봇을 갈아탈 때 첫 그림을 0ms 로 이어 주기 위한 빠른 층이다.
// 로그인 사용자는 OsChat 이 서버(/api/sessions)에서도 다시 불러 클라우드에 쌓인 말을 살린다.
// 탭을 닫으면 이 캐시만 사라진다. 순수 함수만 두어 시험이 쉽다.

export const CHAT_CACHE_MAX = 50

export interface ChatCache<M> {
    /** 이 봇과 이어 쓰는 서버 대화 세션 id (손님은 null) */
    sessionId: string | null
    messages: M[]
}

type StoreRead = Pick<Storage, 'getItem'>
type StoreWrite = Pick<Storage, 'setItem' | 'removeItem'>

interface MsgLike { content: string; card?: unknown; imageUrls?: string[] }

export function chatCacheKey(mentorId: string): string {
    return `os-chat:${mentorId}`
}

export function readChatCache<M>(store: StoreRead | null | undefined, mentorId: string): ChatCache<M> | null {
    if (!store) return null
    try {
        const raw = store.getItem(chatCacheKey(mentorId))
        if (!raw) return null
        const v = JSON.parse(raw) as Partial<ChatCache<M>> | null
        if (!v || !Array.isArray(v.messages)) return null
        return { sessionId: typeof v.sessionId === 'string' ? v.sessionId : null, messages: v.messages }
    } catch {
        return null
    }
}

/** 최근 50개만, 답이 아직 안 온 빈 말풍선(스트림 자리)은 빼고 저장한다. 비면 열쇠를 지운다 */
export function writeChatCache<M extends MsgLike>(store: StoreWrite | null | undefined, mentorId: string, cache: ChatCache<M>): void {
    if (!store) return
    try {
        const kept = cache.messages
            .filter(m => m.content !== '' || m.card != null || (m.imageUrls?.length ?? 0) > 0)
            .slice(-CHAT_CACHE_MAX)
        if (kept.length === 0) { store.removeItem(chatCacheKey(mentorId)); return }
        store.setItem(chatCacheKey(mentorId), JSON.stringify({ sessionId: cache.sessionId, messages: kept }))
    } catch {
        /* 저장소가 막혀 있어도(사생활 모드, 꽉 찼음) 대화는 계속된다 */
    }
}
