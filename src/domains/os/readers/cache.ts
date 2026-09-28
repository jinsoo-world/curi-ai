// domains/os/readers = 방금 읽은 링크를 잠깐 기억한다 (서버 한 대의 메모리, 10분).
//
// 같은 링크를 두고 몇 번 더 물으면(「그 글에서 이건?」) 매번 다시 열지 않게.
// 서버리스라 서버가 바뀌면 사라진다 = 그래도 괜찮다(다시 읽으면 된다). 성공한 것만 기억한다.
// 저장소(DB)에는 남기지 않는다 = 대화 중 링크 읽기의 「한 번 쓰고 버린다」 원칙 그대로.

import type { ReadPage } from '@/domains/agent/fetch-url'

export const LINK_CACHE_TTL_MS = 10 * 60_000
export const LINK_CACHE_MAX = 64

const store = new Map<string, { at: number; page: ReadPage }>()

export function cacheGet(key: string, now = Date.now()): ReadPage | null {
    const hit = store.get(key)
    if (!hit) return null
    if (now - hit.at > LINK_CACHE_TTL_MS) { store.delete(key); return null }
    return hit.page
}

export function cacheSet(key: string, page: ReadPage, now = Date.now()): void {
    if (store.has(key)) store.delete(key)
    store.set(key, { at: now, page })
    // 오래된 것부터 뺀다 (Map 은 넣은 순서를 기억한다)
    while (store.size > LINK_CACHE_MAX) {
        const oldest = store.keys().next().value
        if (oldest === undefined) break
        store.delete(oldest)
    }
}

export function cacheClear(): void {
    store.clear()
}
