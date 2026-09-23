// domains/os/feeds/sync — 연결 하나를 한 번 돌린다 = syncFeed(db, feed).
//
// 순서
//   1. 이 봇의 자료 수와 이미 있는 주소를 한 번에 읽는다(자료는 봇당 10개 한도라 작다)
//   2. 자료 칸이 다 찼으면 밖에 나가지도 않는다. 이유를 last_error 에 적고 끝(매일 헛돌지 않게 시각은 적는다)
//   3. 종류별 가져오기(fetchNewItems). 이미 있는 주소는 가져오기 쪽에서 읽지도 않는다
//   4. 새 글마다 기존 addKnowledgeSource 로 자료를 만들고 feed_id 를 붙인다(공용 함수는 안 고친다)
//   5. 연결 줄을 고친다: 마지막 시각, 가져온 수, 상태, 이유
// 절대 던지지 않는다. 연결 하나가 고장 나도 크론의 다른 연결은 계속 돈다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { addKnowledgeSource } from '@/domains/knowledge'
import { markInjectionPatterns } from '@/domains/chat/injection'
import { MAX_SOURCES_PER_BOT } from '@/domains/os/knowledge'
import type { FeedKind, FeedStatus, FetchNewItems, FetchNewItemsResult, KnowledgeFeed } from './types'
import { isSocialStubKind } from './types'
import { fetchYoutubeItems } from './youtube'
import { fetchWebsiteItems } from './website'
import { fetchPodcastItems } from './podcast'
import { fetchSocialStubItems, SOCIAL_STUB_NOTE } from './social-stub'

const TABLE_MISSING = '42P01'
const COLUMN_MISSING = '42703'

export const FEED_CAP_FULL_NOTE = `자료 칸이 다 찼어요(${MAX_SOURCES_PER_BOT}개). 자료를 빼야 더 가져와요`
/**
 * 지난번 시각보다 조금 앞부터 다시 본다. 시간이 모자라 못 가져온 글을 다음 날 놓치지 않게.
 * 겹치는 글은 주소로 거르니 두 번 들어가지 않는다.
 */
export const SYNC_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000
/** 이것보다 짧은 글은 자료로 넣지 않는다 */
const MIN_ITEM_CHARS = 20

export const FETCHERS: Record<FeedKind, FetchNewItems> = {
    youtube: fetchYoutubeItems,
    website: fetchWebsiteItems,
    podcast: fetchPodcastItems,
    substack: fetchPodcastItems,
    x: fetchSocialStubItems,
    instagram: fetchSocialStubItems,
    tiktok: fetchSocialStubItems,
}

export interface SyncResult {
    feedId: string
    ok: boolean
    /** 새로 만든 자료 수 */
    added: number
    /** 이미 있어서 건너뛴 수 */
    skipped: number
    /** 넣으려다 못 넣은 수 */
    failed: number
    status: FeedStatus
    lastError: string | null
    /** 사람에게 보여 줄 한 줄(성공이어도 붙을 수 있다) */
    note?: string
}

export interface SyncOptions {
    /** 이 시각(Date.now() 기준 ms)을 넘기면 더 넣지 않는다 */
    deadline?: number
    /** 시험용: 종류별 가져오기를 바꿔 끼운다 */
    fetchers?: Partial<Record<FeedKind, FetchNewItems>>
}

function msg(e: unknown, fallback: string): string {
    return e instanceof Error && e.message ? e.message : fallback
}

/** 이 봇의 자료 수 + 이미 있는 원래 주소들 */
export async function loadExistingSources(db: SupabaseClient, mentorId: string): Promise<{ count: number; urls: Set<string> }> {
    const { data, error } = await db.from('knowledge_sources').select('id, original_url').eq('mentor_id', mentorId)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { id: string; original_url: string | null }[]
    return { count: rows.length, urls: new Set(rows.map(r => r.original_url).filter((u): u is string => !!u)) }
}

async function updateFeed(db: SupabaseClient, feedId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await db.from('knowledge_feeds').update(patch).eq('id', feedId)
    if (error) console.error('[os/feeds] 연결 줄 고치기 실패', { feedId, code: error.code, message: error.message })
}

/** 만든 자료에 「어느 연결에서 왔나」를 붙인다. 칸이 아직 없으면(마이그레이션 전) 조용히 넘어간다 */
async function tagSource(db: SupabaseClient, mentorId: string, sourceId: string, feedId: string): Promise<void> {
    const { error } = await db.from('knowledge_sources').update({ feed_id: feedId }).eq('id', sourceId).eq('mentor_id', mentorId)
    if (error && error.code !== COLUMN_MISSING) console.error('[os/feeds] feed_id 붙이기 실패', { sourceId, message: error.message })
}

/** 이 연결로 만든 자료 수를 다시 센다. 못 세면 null */
async function countFeedSources(db: SupabaseClient, mentorId: string, feedId: string): Promise<number | null> {
    const { count, error } = await db.from('knowledge_sources')
        .select('id', { count: 'exact', head: true }).eq('mentor_id', mentorId).eq('feed_id', feedId)
    if (error) return null
    return count ?? 0
}

export async function syncFeed(db: SupabaseClient, feed: KnowledgeFeed, opts: SyncOptions = {}): Promise<SyncResult> {
    const base = { feedId: feed.id, added: 0, skipped: 0, failed: 0 }
    const nowIso = () => new Date().toISOString()
    try {
        // X, Instagram, TikTok = 열쇠 등록 전까지 「준비 중」. 밖에 나가지 않는다
        if (isSocialStubKind(feed.kind)) {
            await updateFeed(db, feed.id, { status: 'paused', last_error: SOCIAL_STUB_NOTE })
            return { ...base, ok: true, status: 'paused', lastError: SOCIAL_STUB_NOTE, note: SOCIAL_STUB_NOTE }
        }

        const existing = await loadExistingSources(db, feed.mentorId)
        const room = MAX_SOURCES_PER_BOT - existing.count
        if (room <= 0) {
            await updateFeed(db, feed.id, { status: 'connected', last_error: FEED_CAP_FULL_NOTE, last_synced_at: nowIso() })
            return { ...base, ok: true, status: 'connected', lastError: FEED_CAP_FULL_NOTE, note: FEED_CAP_FULL_NOTE }
        }

        const since = feed.lastSyncedAt ? new Date(Date.parse(feed.lastSyncedAt) - SYNC_LOOKBACK_MS) : null
        const fetcher = opts.fetchers?.[feed.kind] ?? FETCHERS[feed.kind]

        let fetched: FetchNewItemsResult
        try {
            fetched = await fetcher(feed, since, { isKnown: u => existing.urls.has(u), maxItems: room, deadline: opts.deadline })
        } catch (e) {
            const why = msg(e, '새 글을 가져오지 못했어요')
            await updateFeed(db, feed.id, { status: 'error', last_error: why, last_synced_at: nowIso() })
            return { ...base, ok: false, status: 'error', lastError: why, note: why }
        }

        let added = 0, skipped = 0, failed = 0, cut = false
        const reasons: string[] = []
        for (const item of fetched.items) {
            if (existing.urls.has(item.url)) { skipped++; continue }           // 🔁 같은 주소는 두 번 넣지 않는다
            if (added >= room) break                                           // 자료 칸 한도
            if (opts.deadline && Date.now() > opts.deadline) { cut = true; break }
            const text = String(item.text ?? '').trim()
            if (text.length < MIN_ITEM_CHARS) { failed++; reasons.push('읽을 글이 너무 짧아요'); continue }
            // 🛡 글 속 「이전 지시 무시」류 문장에는 표식을 붙인다(링크 넣기와 같은 규칙)
            const { text: marked, marked: n } = markInjectionPatterns(text)
            if (n > 0) console.warn('[os/feeds] 자료 속 명령문 표식', { mentorId: feed.mentorId, kind: feed.kind, count: n })
            try {
                const title = (item.title || item.url).slice(0, 120)
                const source = await addKnowledgeSource(db, feed.mentorId, title, marked, feed.kind === 'youtube' ? 'youtube' : 'url', item.url)
                existing.urls.add(item.url)
                added++
                const id = (source as { id?: string } | null)?.id
                if (id) await tagSource(db, feed.mentorId, id, feed.id)
            } catch (e) {
                failed++
                reasons.push(msg(e, '자료로 넣지 못했어요'))
            }
        }

        const capHit = existing.count + added >= MAX_SOURCES_PER_BOT
        const counted = await countFeedSources(db, feed.mentorId, feed.id)
        const itemCount = counted ?? feed.itemCount + added
        const notes = [fetched.note, cut ? '시간이 모자라 나머지는 다음에 가져와요' : undefined].filter(Boolean) as string[]
        const lastError = capHit
            ? FEED_CAP_FULL_NOTE
            : failed > 0
                ? `${failed}개는 못 넣었어요(${reasons[0]})`
                : added === 0 && fetched.note ? fetched.note : null

        await updateFeed(db, feed.id, { status: 'connected', last_error: lastError, last_synced_at: nowIso(), item_count: itemCount })
        return {
            feedId: feed.id, ok: true, added, skipped, failed, status: 'connected', lastError,
            note: [lastError, ...notes].filter((v, i, a) => v && a.indexOf(v) === i).join('. ') || undefined,
        }
    } catch (e) {
        const why = msg(e, '새 글을 가져오지 못했어요')
        console.error('[os/feeds] syncFeed', { feedId: feed.id, why })
        try { await updateFeed(db, feed.id, { status: 'error', last_error: why, last_synced_at: nowIso() }) } catch { /* 기록도 못 하면 로그만 */ }
        return { ...base, ok: false, status: 'error', lastError: why, note: why }
    }
}

export { TABLE_MISSING }
