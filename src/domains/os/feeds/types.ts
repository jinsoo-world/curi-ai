// domains/os/feeds — 「계정 연결」에서 같이 쓰는 모양.
//
// 계정 연결 = 크리에이터가 유튜브 채널, 웹사이트, 팟캐스트, Substack 을 봇에 한 번 붙이면
// 새로 올라온 공개 글을 매일 자료로 가져온다. 공개 글만, 공식 방법만(몰래 긁기 없음).
// X, Instagram, TikTok 은 공식 열쇠가 있어야 해서 지금은 모양만 있다(social-stub.ts).

export type FeedKind = 'youtube' | 'website' | 'podcast' | 'substack' | 'x' | 'instagram' | 'tiktok'
export type FeedStatus = 'connected' | 'error' | 'paused'

export const FEED_KINDS: readonly FeedKind[] = ['youtube', 'website', 'podcast', 'substack', 'x', 'instagram', 'tiktok']
/** 공식 열쇠가 있어야 하는 곳 (지금은 연결만 되고 가져오지는 않는다) */
export const SOCIAL_STUB_KINDS: readonly FeedKind[] = ['x', 'instagram', 'tiktok']

export function isFeedKind(v: unknown): v is FeedKind {
    return typeof v === 'string' && (FEED_KINDS as readonly string[]).includes(v)
}
export function isSocialStubKind(kind: FeedKind): boolean {
    return SOCIAL_STUB_KINDS.includes(kind)
}

export interface FeedItem { title: string; url: string; text?: string; publishedAt?: string }

export interface KnowledgeFeed {
    id: string; mentorId: string; userId: string
    kind: FeedKind
    handleOrUrl: string; status: FeedStatus
    lastSyncedAt: string | null; lastError: string | null; itemCount: number; createdAt: string
}

export interface FetchNewItemsResult { items: FeedItem[]; note?: string }

/** 가져오기를 어디까지 할지 (동기화 엔진이 넘겨 준다) */
export interface FetchOptions {
    /** 이미 자료로 있는 주소인가. 있으면 글을 읽지도 않는다(비싼 읽기를 아낀다) */
    isKnown?: (url: string) => boolean
    /** 이번에 새로 가져올 최대 개수 (자료 칸이 남은 만큼) */
    maxItems?: number
    /** 이 시각(Date.now() 기준 ms)을 넘기면 더 읽지 않는다 (서버 실행 한도 60초) */
    deadline?: number
}

/**
 * 새 글 가져오기. 「새 글 없음」은 던지지 않고 items: [] 를 돌려준다.
 * 진짜 고장(주소를 못 엶, 모양을 못 읽음)은 던져도 된다. 동기화 엔진이 받아서 last_error 에 적는다.
 * 세 번째 인자는 선택이다(없으면 제한 없이 동작한다).
 */
export type FetchNewItems = (feed: KnowledgeFeed, since: Date | null, opts?: FetchOptions) => Promise<FetchNewItemsResult>

/** DB 한 줄 → 앱 모양 */
export interface KnowledgeFeedRow {
    id: string; mentor_id: string; user_id: string; kind: FeedKind; handle_or_url: string; status: FeedStatus
    last_synced_at: string | null; last_error: string | null; item_count: number | null; created_at: string
}
export function feedFromRow(r: KnowledgeFeedRow): KnowledgeFeed {
    return {
        id: r.id, mentorId: r.mentor_id, userId: r.user_id, kind: r.kind, handleOrUrl: r.handle_or_url,
        status: r.status, lastSyncedAt: r.last_synced_at, lastError: r.last_error,
        itemCount: r.item_count ?? 0, createdAt: r.created_at,
    }
}
export const FEED_COLUMNS = 'id, mentor_id, user_id, kind, handle_or_url, status, last_synced_at, last_error, item_count, created_at'
